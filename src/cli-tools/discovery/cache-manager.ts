import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getVectaHubPath } from '../../infrastructure/paths/index.js';
import { type InfrastructureContext } from '../../infrastructure/context.js';
import { createLLMConfig, LLMClient } from '../../nl/llm.js';
import { TOOL_CAPABILITY_PARSER_ID } from '../../nl/prompt-manager.js';

const execFileAsync = promisify(execFile);

const MAX_HELP_OUTPUT_LENGTH = 8000;
const CACHE_DIR_NAME = 'cache';
const TOOL_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const DEFAULT_AGENT_CLIS = ['aider', 'claude', 'codex', 'cursor', 'gemini', 'cline', 'copilot', 'devika', 'swe-agent', 'openhands'];

export interface ToolCacheEntry {
  toolName: string;
  version: string;
  helpOutput: string;
  capabilities: string[];
  discoveredAt: string;
}

interface ToolCacheManagerOptions {
  cacheDir?: string;
  context?: InfrastructureContext;
}

function readProcessStdout(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) {
    return null;
  }

  const stdout = error.stdout;
  if (typeof stdout === 'string') {
    return stdout;
  }
  if (Buffer.isBuffer(stdout)) {
    return stdout.toString();
  }
  return null;
}

function formatProcessHelpError(error: unknown): string {
  return readProcessStdout(error) ?? (error instanceof Error ? error.message : String(error));
}

export class ToolCacheManager {
  private cacheDir: string;
  private context: InfrastructureContext;

  constructor(options: ToolCacheManagerOptions = {}) {
    if (!options.context) {
      throw new Error('InfrastructureContext must be explicitly provided to ToolCacheManager');
    }
    this.context = options.context;
    this.cacheDir = options.cacheDir ?? getVectaHubPath(CACHE_DIR_NAME);
  }

  private getLogger() {
    return this.context.logger.getLogger('cache-manager');
  }

  private async ensureCacheDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  private getCachePath(toolName: string): string {
    return join(this.cacheDir, `${toolName}.help.json`);
  }

  private getAllowedTools(): string[] {
    try {
      const config = this.context.config.getConfig();
      const configTools = Object.keys(config.external_cli);
      return [...new Set([...DEFAULT_AGENT_CLIS, ...configTools])];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.getLogger().debug({ error: message }, 'Failed to load agent CLIs from config, using defaults');
      return [...DEFAULT_AGENT_CLIS];
    }
  }

  async getCachedHelp(toolName: string): Promise<ToolCacheEntry | null> {
    const cachePath = this.getCachePath(toolName);
    try {
      const raw = await readFile(cachePath, 'utf-8');
      return JSON.parse(raw) as ToolCacheEntry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.getLogger().warn(`缓存文件损坏: ${toolName}，将重新发现. 错误: ${message}`);
      return null;
    }
  }

  async cacheHelp(toolName: string, helpOutput: string, capabilities: string[] = [], version = 'unknown'): Promise<void> {
    const entry: ToolCacheEntry = {
      toolName,
      version,
      helpOutput: helpOutput.length > MAX_HELP_OUTPUT_LENGTH
        ? helpOutput.substring(0, MAX_HELP_OUTPUT_LENGTH) + '\n... (truncated)'
        : helpOutput,
      capabilities,
      discoveredAt: new Date().toISOString(),
    };
    await this.ensureCacheDir();
    await writeFile(this.getCachePath(toolName), JSON.stringify(entry, null, 2), 'utf-8');
  }

  async discoverToolHelp(toolName: string, options?: { skipCapabilityInference?: boolean }): Promise<ToolCacheEntry> {
    if (!TOOL_NAME_REGEX.test(toolName)) {
      throw new Error(`非法工具名称: ${toolName}，仅允许字母、数字、点、下划线和短横线`);
    }

    const allowedTools = this.getAllowedTools();
    if (!allowedTools.includes(toolName)) {
      throw new Error(`未知 Agent CLI: ${toolName}，当前支持: ${allowedTools.join(', ')}`);
    }

    const cached = await this.getCachedHelp(toolName);
    if (cached) {
      return cached;
    }

    let helpOutput: string;
    let version: string;

    try {
      const { stdout } = await execFileAsync(toolName, ['--help'], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      helpOutput = stdout;
    } catch (error) {
      helpOutput = formatProcessHelpError(error);
    }

    try {
      const { stdout } = await execFileAsync(toolName, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      version = stdout.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.getLogger().debug({ error: message, tool: toolName }, 'Version detection failed');
      version = 'unknown';
    }

    this.context.audit.getHelper().securityAction('TOOL_DISCOVERY', toolName, 'COMPLETED', 'cache-manager');

    let capabilities: string[] = [];
    if (!options?.skipCapabilityInference) {
      capabilities = await this.inferCapabilities(toolName, helpOutput);
    }

    await this.cacheHelp(toolName, helpOutput, capabilities, version);

    return (await this.getCachedHelp(toolName))!;
  }

  private async inferCapabilities(toolName: string, helpOutput: string): Promise<string[]> {
    const llmConfig = createLLMConfig();
    if (!llmConfig) {
      this.getLogger().warn('LLM 未配置，跳过 capabilities 推断');
      return [];
    }

    try {
      const client = new LLMClient(llmConfig, { auditHelper: this.context.audit.getHelper() });
      const rawOutput = await client.completeRaw(
        TOOL_CAPABILITY_PARSER_ID,
        `推断工具 ${toolName} 的能力`,
        { toolName, helpOutput: helpOutput.substring(0, 4000) },
      );

      const cleaned = rawOutput.trim();
      const jsonStr = this.extractJsonArray(cleaned);
      if (!jsonStr) {
        this.getLogger().warn(`capabilities 推断失败: 未找到 JSON 数组，原始输出: ${cleaned.substring(0, 200)}`);
        return [];
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((c: unknown) => typeof c === 'string').map((c: string) => c.toLowerCase());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.getLogger().warn(`capabilities 推断异常: ${msg}`);
      return [];
    }
  }

  private extractJsonArray(str: string): string | null {
    const start = str.indexOf('[');
    const end = str.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    return str.substring(start, end + 1);
  }

  async listCached(): Promise<string[]> {
    try {
      const files = await readdir(this.cacheDir);
      return files
        .filter((f: string) => f.endsWith('.help.json'))
        .map((f: string) => f.replace('.help.json', ''));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.getLogger().debug({ error: message, dir: this.cacheDir }, 'Failed to list cached tools');
      return [];
    }
  }

  async invalidate(toolName: string): Promise<void> {
    const cachePath = this.getCachePath(toolName);
    try {
      await unlink(cachePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

let globalCacheManager: ToolCacheManager | null = null;

export function createToolCacheManager(options: ToolCacheManagerOptions = {}): ToolCacheManager {
  return new ToolCacheManager(options);
}

export function getToolCacheManager(context?: InfrastructureContext): ToolCacheManager {
  if (!globalCacheManager) {
    if (!context) {
      throw new Error('InfrastructureContext must be explicitly provided to initialize ToolCacheManager');
    }
    globalCacheManager = new ToolCacheManager({ context });
  }
  return globalCacheManager;
}
