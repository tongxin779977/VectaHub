import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { createConsoleLogger } from '../utils/logger.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { AGENT_CMD_GENERATOR_ID } from '../nl/prompt-manager.js';
import { getToolCacheManager } from '../cli-tools/discovery/cache-manager.js';
import { getSecurityManager } from '../security-protocol/manager.js';
import { audit } from '../infrastructure/audit/index.js';

const execFileAsync = promisify(execFile);
const logger = createConsoleLogger('run-task');
const DEFAULT_AGENT_CLI_TIMEOUT = 600000;
const agentCliTimeout = parseInt(process.env.AGENT_CLI_TIMEOUT || '', 10) || DEFAULT_AGENT_CLI_TIMEOUT;

interface GeneratedCommand {
  command: string;
  args: string[];
  explanation: string;
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
    '按照项目要求进行开发。',
    `任务编号：${taskId}`,
    `任务描述：${taskLabel}`,
    `参考文档：${docPath}`,
    '请严格按文档要求实现，完成后运行项目测试验证。',
  ].join('\n');
}

export async function runTask(options: {
  tool: string;
  taskId: string;
  taskLabel?: string;
  doc?: string;
  dryRun?: boolean;
}): Promise<{ success: boolean; output: string; command: string }> {
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
    });

    const combinedOutput = stdout + (stderr ? '\n' + stderr : '');
    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
    logger.info('任务执行成功');
    console.log(combinedOutput);

    return { success: true, output: combinedOutput, command: fullCommand };
  } catch (error) {
    const execError = error as any;
    const errStdout = execError.stdout?.toString?.() || '';
    const errStderr = execError.stderr?.toString?.() || '';
    const errOutput = errStdout + (errStderr ? '\n' + errStderr : '') || execError.message || String(error);
    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'FAILED', 'run-task');
    logger.error(`任务执行失败: ${errOutput}`);
    return { success: false, output: errOutput, command: fullCommand };
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
        console.log(JSON.stringify({
          ok: result.success,
          command: result.command,
          output: result.output.substring(0, 2000),
        }, null, 2));
      } else if (!result.success) {
        process.exit(1);
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
