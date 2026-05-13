import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getVectaHubPath } from '../../utils/paths.js';
import { audit } from '../../infrastructure/audit/index.js';
import { getLogger } from '../../utils/logger.js';
import { createLLMConfig, LLMClient } from '../../nl/llm.js';
import { TOOL_CAPABILITY_PARSER_ID } from '../../nl/prompt-manager.js';
import { loadConfig } from '../../infrastructure/config/index.js';

const execFileAsync = promisify(execFile);

const MAX_HELP_OUTPUT_LENGTH = 8000;
const CACHE_DIR_NAME = 'cache';
const TOOL_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const DEFAULT_AGENT_CLIS = ['aider', 'claude', 'codex', 'cursor', 'gemini', 'cline', 'copilot', 'devika', 'swe-agent', 'openhands'];
const cacheLogger = getLogger('cache-manager');

export interface ToolCacheEntry {
  toolName: string;
  version: string;
  helpOutput: string;
  capabilities: string[];
  discoveredAt: string;
}

export class ToolCacheManager {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? getVectaHubPath(CACHE_DIR_NAME);
  }

  private async ensureCacheDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  private getCachePath(toolName: string): string {
    return join(this.cacheDir, `${toolName}.help.json`);
  }

  private getAllowedTools(): string[] {
    try {
      const config = loadConfig();
      const configTools = Object.keys(config.external_cli);
      return [...new Set([...DEFAULT_AGENT_CLIS, ...configTools])];
    } catch {
      return [...DEFAULT_AGENT_CLIS];
    }
  }

  async getCachedHelp(toolName: string): Promise<ToolCacheEntry | null> {
    const cachePath = this.getCachePath(toolName);
    try {
      const raw = await readFile(cachePath, 'utf-8');
      return JSON.parse(raw) as ToolCacheEntry;
    } catch {
      cacheLogger.warn(`缓存文件损坏: ${toolName}，将重新发现`);
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
      helpOutput = error instanceof Error ? (error as any).stdout?.toString?.() || error.message : String(error);
    }

    try {
      const { stdout } = await execFileAsync(toolName, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      version = stdout.trim();
    } catch {
      version = 'unknown';
    }

    audit.securityAction('TOOL_DISCOVERY', toolName, 'COMPLETED', 'cache-manager');

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
      cacheLogger.warn('LLM 未配置，跳过 capabilities 推断');
      return [];
    }

    try {
      const client = new LLMClient(llmConfig);
      const rawOutput = await client.completeRaw(
        TOOL_CAPABILITY_PARSER_ID,
        `推断工具 ${toolName} 的能力`,
        { toolName, helpOutput: helpOutput.substring(0, 4000) },
      );

      const cleaned = rawOutput.trim();
      const jsonStr = this.extractJsonArray(cleaned);
      if (!jsonStr) {
        cacheLogger.warn(`capabilities 推断失败: 未找到 JSON 数组，原始输出: ${cleaned.substring(0, 200)}`);
        return [];
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((c: unknown) => typeof c === 'string').map((c: string) => c.toLowerCase());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      cacheLogger.warn(`capabilities 推断异常: ${msg}`);
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
    } catch {
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

export function createToolCacheManager(cacheDir?: string): ToolCacheManager {
  return new ToolCacheManager(cacheDir);
}

export function getToolCacheManager(): ToolCacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new ToolCacheManager();
  }
  return globalCacheManager;
}
