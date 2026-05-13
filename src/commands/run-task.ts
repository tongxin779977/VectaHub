import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { getLogger } from '../utils/logger.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { AGENT_CMD_GENERATOR_ID } from '../nl/prompt-manager.js';
import { getToolCacheManager } from '../cli-tools/discovery/cache-manager.js';
import { getSecurityManager } from '../security-protocol/manager.js';
import { audit } from '../infrastructure/audit/index.js';

const execFileAsync = promisify(execFile);
const logger = getLogger('run-task');
const IDE_ENV_PATTERNS = [
  /^TERM_PROGRAM$/,
  /^VSCODE_/,
  /^ELECTRON_/,
  /^ICUBE_/,
  /^__CFBundleIdentifier$/,
  /^SAFE_RM_/,
];

function stripIDEEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!IDE_ENV_PATTERNS.some(p => p.test(key))) {
      env[key] = value;
    }
  }
  return env;
}

const DEFAULT_AGENT_CLI_TIMEOUT = 600000;
const agentCliTimeout = parseInt(process.env.AGENT_CLI_TIMEOUT || '', 10) || DEFAULT_AGENT_CLI_TIMEOUT;
const MAX_JSON_OUTPUT_LENGTH = 1200;
const NOISY_OUTPUT_PATTERNS = [
  /YOLO mode is enabled\..*/i,
  /Warning: 256-color support not detected\..*/i,
  /Ripgrep is not available\..*/i,
  /\(node:\d+\).*DeprecationWarning.*/i,
  /Attempt \d+ failed\..*/i,
  /\s+at\s.+/i,
  /.*_GaxiosError:.*/i,
  /.*FetchError\d*:.*/i,
  /\s*(config|response|error):\s*\{.*/i,
];

interface GeneratedCommand {
  command: string;
  args: string[];
  explanation: string;
}

export interface GitChangeInfo {
  diffStat: string;
  shortStat: string;
  changedFiles: string[];
}

export interface RunTaskResult {
  success: boolean;
  output: string;
  command: string;
  gitChanges?: GitChangeInfo;
}

export interface RunTaskJsonResult {
  ok: boolean;
  command: string;
  output: string;
  outputTruncated: boolean;
  gitChanges?: {
    shortStat: string;
    changedFiles: string[];
    diffStat: string;
  };
}

function extractOutermostJson(str: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) return str.substring(start, i + 1);
    }
  }
  return null;
}

function buildCommandString(command: string, args: string[]): string {
  const escaped = args.map(a => {
    if (/[\s"']/.test(a)) {
      return `"${a.replace(/"/g, '\\"')}"`;
    }
    return a;
  });
  return [command, ...escaped].join(' ');
}

function buildDefaultPrompt(taskId: string, taskLabel: string, docPath: string): string {
  return [
    '请严格按照以下要求实现任务。',
    '',
    `任务编号：${taskId}`,
    `任务描述：${taskLabel}`,
    `参考文档：${docPath}`,
    '',
    '执行步骤：',
    `1. 先阅读参考文档 ${docPath}，找到任务 ${taskId} 的详细需求`,
    '2. 按照文档中的技术方案和接口定义完整实现',
    '3. 保持与现有代码风格一致',
    '4. 实现完成后，运行项目测试验证功能正确性',
  ].join('\n');
}

export async function collectGitChanges(): Promise<GitChangeInfo | null> {
  try {
    const { stdout: shortStat } = await execFileAsync('git', ['diff', '--shortstat'], { timeout: 5000 });
    if (!shortStat.trim()) return null;

    const { stdout: diffStat } = await execFileAsync('git', ['diff', '--stat'], { timeout: 5000 });
    const changedFiles = diffStat.split('\n')
      .map(line => {
        const parts = line.split('|');
        return parts[0]?.trim() || '';
      })
      .filter(f => f && !f.includes('file') && !f.includes('changed'));

    return {
      diffStat: diffStat.trim().substring(0, 3000),
      shortStat: shortStat.trim(),
      changedFiles,
    };
  } catch {
    return null;
  }
}

function compactAgentOutput(output: string): { output: string; truncated: boolean } {
  const cleanedLines = output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .filter(line => !NOISY_OUTPUT_PATTERNS.some(pattern => pattern.test(line)));

  const compacted = cleanedLines.join('\n').trim();
  if (compacted.length <= MAX_JSON_OUTPUT_LENGTH) {
    return { output: compacted, truncated: compacted.length !== output.trim().length };
  }

  return {
    output: `${compacted.substring(0, MAX_JSON_OUTPUT_LENGTH - 3).trimEnd()}...`,
    truncated: true,
  };
}

export function formatRunTaskJson(result: RunTaskResult): RunTaskJsonResult {
  const compacted = compactAgentOutput(result.output);
  const jsonResult: RunTaskJsonResult = {
    ok: result.success,
    command: result.command,
    output: compacted.output,
    outputTruncated: compacted.truncated,
  };

  if (result.gitChanges) {
    jsonResult.gitChanges = {
      shortStat: result.gitChanges.shortStat,
      changedFiles: result.gitChanges.changedFiles,
      diffStat: result.gitChanges.diffStat,
    };
  }

  return jsonResult;
}

export async function runTask(options: {
  tool: string;
  taskId: string;
  taskLabel?: string;
  doc?: string;
  dryRun?: boolean;
}): Promise<RunTaskResult> {
  const { tool, taskId, taskLabel, doc, dryRun } = options;

  const llmConfig = createLLMConfig();
  if (!llmConfig) {
    throw new Error('LLM 未配置，请先运行 vectahub setup 配置 AI 提供商');
  }

  const cacheManager = getToolCacheManager();
  const cacheEntry = await cacheManager.discoverToolHelp(tool);

  const client = new LLMClient(llmConfig);
  const docPath = doc ? resolve(doc) : '(未指定文档)';
  const label = taskLabel || `任务 ${taskId}`;

  const rawOutput = await client.completeRaw(AGENT_CMD_GENERATOR_ID, `任务 ${taskId}: ${label}，请基于工具用法生成执行命令。`, {
    toolName: tool,
    helpOutput: cacheEntry.helpOutput,
    taskId,
    taskLabel: label,
    docPath,
  });

  let generated: GeneratedCommand;
  try {
    const cleaned = rawOutput.trim();
    const jsonStr = extractOutermostJson(cleaned);
    if (!jsonStr) {
      throw new Error('LLM 输出中未找到有效的 JSON');
    }
    generated = JSON.parse(jsonStr) as GeneratedCommand;
  } catch (parseError) {
    logger.warn(`LLM 命令生成失败，使用默认提示词模式。原始输出: ${rawOutput.substring(0, 200)}`);
    generated = {
      command: tool,
      args: ['--message', buildDefaultPrompt(taskId, label, docPath)],
      explanation: '使用默认提示词模板',
    };
  }

  const fullCommand = buildCommandString(generated.command, generated.args);

  const securityManager = getSecurityManager();
  const detectionResult = securityManager.detectCommand(fullCommand, generated.command);
  if (detectionResult.isDangerous) {
    const ruleName = detectionResult.rule?.name || 'Unknown Rule';
    logger.error(`安全策略拦截: 命令匹配规则 "${ruleName}" (severity: ${detectionResult.severity})`);
    logger.error(`匹配模式: ${detectionResult.matchedPattern}`);
    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
    return { success: false, output: `安全策略拦截: ${ruleName}`, command: fullCommand };
  }

  audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'EXECUTING', 'run-task');

  if (dryRun) {
    logger.info(`[dry-run] 将执行: ${fullCommand}`);
    if (generated.explanation) {
      logger.info(`说明: ${generated.explanation}`);
    }
    return { success: true, output: '', command: fullCommand };
  }

  logger.info(`执行: ${fullCommand}`);
  if (generated.explanation) {
    logger.info(`说明: ${generated.explanation}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(generated.command, generated.args, {
      timeout: agentCliTimeout,
      cwd: process.cwd(),
      env: stripIDEEnv(),
    });

    const combinedOutput = stdout + (stderr ? '\n' + stderr : '');
    const gitChanges = await collectGitChanges() ?? undefined;
    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
    logger.info('任务执行成功');
    if (gitChanges) {
      logger.info(`变更文件: ${gitChanges.changedFiles.length} 个`);
    }
    return { success: true, output: combinedOutput, command: fullCommand, gitChanges };
  } catch (error) {
    const execError = error as any;
    const errStdout = execError.stdout?.toString?.() || '';
    const errStderr = execError.stderr?.toString?.() || '';
    const errOutput = errStdout + (errStderr ? '\n' + errStderr : '') || execError.message || String(error);
    const gitChanges = await collectGitChanges() ?? undefined;
    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'FAILED', 'run-task');
    logger.error(`任务执行失败: ${errOutput}`);
    return { success: false, output: errOutput, command: fullCommand, gitChanges };
  }
}

export const runTaskCmd = new Command('run-task')
  .description('执行文档任务：根据任务描述和 Agent CLI 工具生成并执行命令')
  .requiredOption('--tool <name>', 'Agent CLI 工具名称（如 aider、claude）')
  .requiredOption('--task-id <id>', '任务编号')
  .option('--task-label <label>', '任务描述')
  .option('--doc <path>', '参考文档路径')
  .option('--dry-run', '仅生成命令，不实际执行')
  .option('--json', '以 JSON 格式输出')
  .action(async (options: {
    tool: string;
    taskId: string;
    taskLabel?: string;
    doc?: string;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    try {
      const result = await runTask(options);

      if (options.json) {
        console.log(JSON.stringify(formatRunTaskJson(result), null, 2));
      } else if (!result.success) {
        console.log(result.output);
        process.exit(1);
      } else {
        console.log(result.output);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      } else {
        logger.error(`执行失败: ${message}`);
      }
      process.exit(1);
    }
  });
