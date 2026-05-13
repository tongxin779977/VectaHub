import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { getLogger } from '../utils/logger.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { AGENT_CMD_GENERATOR_ID } from '../nl/prompt-manager.js';
import { getToolCacheManager } from '../cli-tools/discovery/cache-manager.js';
import { getSecurityManager } from '../security-protocol/manager.js';
import { audit } from '../infrastructure/audit/index.js';
import { createChildEnv, getTraceContextFromEnv, startSpan, withSpan } from '../infrastructure/trace/index.js';
import { deriveAgentTaskBoundary, deriveDocExcerpt } from './agent-task-contract.js';
import type { AgentTaskContract } from '../types/doc-task.js';

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
const DEFAULT_MAX_JSON_OUTPUT_LENGTH = 50000;
const MAX_JSON_OUTPUT_LENGTH = parseInt(process.env.RUN_TASK_MAX_JSON_OUTPUT_LENGTH || '', 10) || DEFAULT_MAX_JSON_OUTPUT_LENGTH;
const TRUNCATED_OUTPUT_MARKER = '\n... (output truncated)';
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
const TRACE_TEXT_MAX_LENGTH = 500;
const PROMPT_CONTRACT_MAX_LENGTH = 12000;

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
  agentTaskContract?: AgentTaskContractSummary;
}

export interface RunTaskJsonResult {
  ok: boolean;
  command: string;
  output: string;
  outputTruncated: boolean;
  agentTaskContract?: AgentTaskContractSummary;
  gitChanges?: {
    shortStat: string;
    changedFiles: string[];
    diffStat: string;
  };
}

export interface AgentTaskContractSummary {
  boundaryConfidence: AgentTaskContract['boundaryConfidence'];
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  executionMode: AgentTaskContract['executionMode'];
  docExcerptTruncated: boolean;
  excerptStrategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback' | 'none';
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

function buildDefaultPrompt(taskId: string, taskLabel: string, docPath: string, contract: AgentTaskContract): string {
  const prompt = [
    '请严格按照以下要求实现任务。',
    '',
    `任务编号：${taskId}`,
    `任务描述：${taskLabel}`,
    `参考文档：${docPath}`,
    '',
    '任务边界合同：',
    `文档片段：\n${contract.docExcerpt || '(未提供文档片段，请只根据任务描述执行最小改动)'}`,
    '',
    `允许修改范围：${formatListForPrompt(contract.allowedFiles, '未推导出明确文件，请保持最小改动并在输出中说明实际修改文件')}`,
    `禁止修改范围：${formatListForPrompt(contract.forbiddenFiles, '未配置')}`,
    `建议验证命令：${formatListForPrompt(contract.validationCommands, 'npm run typecheck')}`,
    `边界可信度：${contract.boundaryConfidence}`,
    '',
    '执行要求：',
    '- 只围绕当前任务改动。',
    '- 优先修改允许修改范围内的文件。',
    '- 不要修改禁止修改范围内的文件。',
    '- 如果必须越界修改，先在输出中说明原因。',
    '- 完成后运行或说明建议验证命令。',
    '',
    '执行步骤：',
    `1. 先阅读参考文档 ${docPath}，找到任务 ${taskId} 的详细需求`,
    '2. 按照文档中的技术方案和接口定义完整实现',
    '3. 保持与现有代码风格一致',
    '4. 实现完成后，运行项目测试验证功能正确性',
  ].join('\n');

  if (prompt.length <= PROMPT_CONTRACT_MAX_LENGTH) {
    return prompt;
  }
  return `${prompt.slice(0, PROMPT_CONTRACT_MAX_LENGTH).trimEnd()}\n... (prompt contract truncated)`;
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
    output: truncateAtLineBoundary(compacted, MAX_JSON_OUTPUT_LENGTH),
    truncated: true,
  };
}

function truncateAtLineBoundary(output: string, maxLength: number): string {
  if (output.length <= maxLength) return output;

  const targetLength = maxLength - TRUNCATED_OUTPUT_MARKER.length;
  if (targetLength <= 0) {
    return TRUNCATED_OUTPUT_MARKER.trim().slice(0, maxLength);
  }

  const minBoundary = Math.floor(targetLength * 0.8);
  const newlineIndex = output.lastIndexOf('\n', targetLength);
  const cutIndex = newlineIndex >= minBoundary ? newlineIndex : targetLength;

  return `${output.slice(0, cutIndex).trimEnd()}${TRUNCATED_OUTPUT_MARKER}`;
}

function limitText(value: string): string {
  if (value.length <= TRACE_TEXT_MAX_LENGTH) return value;
  return `${value.slice(0, TRACE_TEXT_MAX_LENGTH)}...`;
}

function formatListForPrompt(values: string[], emptyText: string): string {
  if (!values.length) return emptyText;
  return values.map(value => `\n- ${value}`).join('');
}

function buildAgentTaskContract(input: {
  taskId: string;
  label: string;
  docPath?: string;
  projectRoot: string;
}): AgentTaskContract & { summary: AgentTaskContractSummary } {
  let docExcerpt = '';
  let docExcerptTruncated = false;
  let excerptStrategy: AgentTaskContractSummary['excerptStrategy'] = 'none';
  const notes: string[] = [];

  if (input.docPath && existsSync(input.docPath)) {
    const docContent = readFileSync(input.docPath, 'utf-8');
    const excerpt = deriveDocExcerpt({
      docContent,
      taskId: input.taskId,
      label: input.label,
    });
    docExcerpt = excerpt.excerpt;
    docExcerptTruncated = excerpt.truncated;
    excerptStrategy = excerpt.strategy;
  } else if (input.docPath) {
    notes.push('doc-not-found');
  } else {
    notes.push('doc-not-provided');
  }

  const boundary = deriveAgentTaskBoundary({
    docExcerpt,
    label: input.label,
    projectRoot: input.projectRoot,
  });
  const executionMode: AgentTaskContract['executionMode'] = boundary.parallelEligible
    ? 'parallel-eligible'
    : 'serial';
  const contract: AgentTaskContract = {
    taskId: input.taskId,
    label: input.label,
    docPath: input.docPath,
    docExcerpt,
    allowedFiles: boundary.allowedFiles,
    forbiddenFiles: boundary.forbiddenFiles,
    validationCommands: boundary.validationCommands,
    timeoutMs: agentCliTimeout,
    executionMode,
    boundaryConfidence: boundary.boundaryConfidence,
    notes: boundary.reason ? [...notes, boundary.reason] : notes,
  };
  const summary: AgentTaskContractSummary = {
    boundaryConfidence: contract.boundaryConfidence,
    allowedFiles: contract.allowedFiles,
    forbiddenFiles: contract.forbiddenFiles,
    validationCommands: contract.validationCommands,
    executionMode: contract.executionMode,
    docExcerptTruncated,
    excerptStrategy,
  };

  return { ...contract, summary };
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
  if (result.agentTaskContract) {
    jsonResult.agentTaskContract = result.agentTaskContract;
  }

  return jsonResult;
}

export async function runTask(options: {
  tool?: string;
  taskId: string;
  taskLabel?: string;
  doc?: string;
  dryRun?: boolean;
  contractPreview?: boolean;
}): Promise<RunTaskResult> {
  const { taskId, taskLabel, doc, dryRun, contractPreview } = options;
  const tool = options.tool || '';
  const baseAttributes = { taskId, tool, dryRun: Boolean(dryRun), contractPreview: Boolean(contractPreview) };
  const incomingContext = getTraceContextFromEnv();

  return withSpan('cli.run-task', async (rootSpan) => {
    const traceContext = { traceId: rootSpan.traceId, source: 'cli' as const };
    const docPath = doc ? resolve(doc) : '(未指定文档)';
    const label = taskLabel || `任务 ${taskId}`;
    const contractSpan = startSpan('cli.run-task.buildAgentTaskContract', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: baseAttributes,
    });
    let agentTaskContract: AgentTaskContract & { summary: AgentTaskContractSummary };
    try {
      agentTaskContract = buildAgentTaskContract({
        taskId,
        label,
        docPath: doc ? docPath : undefined,
        projectRoot: process.cwd(),
      });
    } catch (error) {
      await contractSpan.fail(error);
      throw error;
    }
    const agentTaskContractSummary = agentTaskContract.summary;
    const { summary: _summary, ...agentTaskContractForPrompt } = agentTaskContract;
    await contractSpan.end({
      contractBoundaryConfidence: agentTaskContractSummary.boundaryConfidence,
      contractAllowedFileCount: agentTaskContractSummary.allowedFiles.length,
      contractForbiddenFileCount: agentTaskContractSummary.forbiddenFiles.length,
      contractValidationCommandCount: agentTaskContractSummary.validationCommands.length,
      contractExcerptStrategy: agentTaskContractSummary.excerptStrategy,
      contractExcerptTruncated: agentTaskContractSummary.docExcerptTruncated,
    });

    if (contractPreview) {
      return {
        success: true,
        output: '',
        command: '',
        agentTaskContract: agentTaskContractSummary,
      };
    }

    if (!tool) {
      throw new Error('缺少 Agent CLI 工具名称，请传入 --tool <name>');
    }

    const llmConfig = await withSpan('cli.run-task.loadLlmConfig', async () => {
      const config = createLLMConfig();
      if (!config) {
        throw new Error('LLM 未配置，请先运行 vectahub setup 配置 AI 提供商');
      }
      return config;
    }, { context: traceContext, parentSpanId: rootSpan.spanId, source: 'cli', attributes: baseAttributes });

    const cacheManager = getToolCacheManager();
    const discoverSpan = startSpan('cli.run-task.discoverToolHelp', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: baseAttributes,
    });
    const cacheEntry = await cacheManager.discoverToolHelp(tool);
    await discoverSpan.end({ helpLength: cacheEntry.helpOutput.length });

    const client = new LLMClient(llmConfig);

    let fallbackUsed = false;
    const generateSpan = startSpan('cli.run-task.generateCommand', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: baseAttributes,
    });
    let rawOutput = '';
    try {
      rawOutput = await client.completeRaw(AGENT_CMD_GENERATOR_ID, `任务 ${taskId}: ${label}，请基于工具用法和任务边界合同生成执行命令。`, {
        toolName: tool,
        helpOutput: cacheEntry.helpOutput,
        taskId,
        taskLabel: label,
        docPath,
        agentTaskContract: JSON.stringify(agentTaskContractForPrompt),
        agentTaskContractSummary: JSON.stringify(agentTaskContractSummary),
      });
    } catch (error) {
      await generateSpan.fail(error, { fallbackUsed: false, command: '' });
      throw error;
    }

    let generated: GeneratedCommand;
    try {
      const cleaned = rawOutput.trim();
      const jsonStr = extractOutermostJson(cleaned);
      if (!jsonStr) {
        throw new Error('LLM 输出中未找到有效的 JSON');
      }
      generated = JSON.parse(jsonStr) as GeneratedCommand;
    } catch {
      fallbackUsed = true;
      logger.warn(`LLM 命令生成失败，使用默认提示词模式。原始输出: ${rawOutput.substring(0, 200)}`);
      generated = {
        command: tool,
        args: ['--message', buildDefaultPrompt(taskId, label, docPath, agentTaskContract)],
        explanation: '使用默认提示词模板',
      };
    }

    const fullCommand = buildCommandString(generated.command, generated.args);
    await generateSpan.end({
      fallbackUsed,
      command: limitText(fullCommand),
    });

    const securityManager = getSecurityManager();
    const securitySpan = startSpan('cli.run-task.securityCheck', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: baseAttributes,
    });
    const detectionResult = securityManager.detectCommand(fullCommand, generated.command);
    await securitySpan.end({
      dangerous: Boolean(detectionResult.isDangerous),
      severity: detectionResult.severity || 'none',
      ruleName: detectionResult.rule?.name || '',
      command: limitText(fullCommand),
      fallbackUsed,
    });
    if (detectionResult.isDangerous) {
      const ruleName = detectionResult.rule?.name || 'Unknown Rule';
      logger.error(`安全策略拦截: 命令匹配规则 "${ruleName}" (severity: ${detectionResult.severity})`);
      logger.error(`匹配模式: ${detectionResult.matchedPattern}`);
      audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return { success: false, output: `安全策略拦截: ${ruleName}`, command: fullCommand, agentTaskContract: agentTaskContractSummary };
    }

    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'EXECUTING', 'run-task');

    if (dryRun) {
      logger.info(`[dry-run] 将执行: ${fullCommand}`);
      if (generated.explanation) {
        logger.info(`说明: ${generated.explanation}`);
      }
      return { success: true, output: '', command: fullCommand, agentTaskContract: agentTaskContractSummary };
    }

    logger.info(`执行: ${fullCommand}`);
    if (generated.explanation) {
      logger.info(`说明: ${generated.explanation}`);
    }

    try {
      const spawnEnv = createChildEnv(traceContext, rootSpan.spanId);
      const spawnSpan = startSpan('cli.run-task.spawnAgent', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          fallbackUsed,
          command: limitText(fullCommand),
          timeoutMs: agentCliTimeout,
        },
      });
      const { stdout, stderr } = await execFileAsync(generated.command, generated.args, {
        timeout: agentCliTimeout,
        cwd: process.cwd(),
        env: {
          ...stripIDEEnv(),
          ...spawnEnv,
        },
      });
      await spawnSpan.end({
        stdoutLength: stdout.length,
        stderrLength: stderr?.length || 0,
        exitCode: 0,
      });

      const combinedOutput = stdout + (stderr ? '\n' + stderr : '');
      const collectSpan = startSpan('cli.run-task.collectGitChanges', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: baseAttributes,
      });
      const gitChanges = await collectGitChanges() ?? undefined;
      await collectSpan.end({ changedFileCount: gitChanges?.changedFiles.length || 0 });
      await withSpan('cli.run-task.formatJson', async () => {
        formatRunTaskJson({ success: true, output: combinedOutput, command: fullCommand, gitChanges });
      }, {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          command: limitText(fullCommand),
          fallbackUsed,
        },
      });

      audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
      logger.info('任务执行成功');
      if (gitChanges) {
        logger.info(`变更文件: ${gitChanges.changedFiles.length} 个`);
      }
      return { success: true, output: combinedOutput, command: fullCommand, gitChanges, agentTaskContract: agentTaskContractSummary };
    } catch (error) {
      const execError = error as any;
      const errStdout = execError.stdout?.toString?.() || '';
      const errStderr = execError.stderr?.toString?.() || '';
      const errOutput = errStdout + (errStderr ? '\n' + errStderr : '') || execError.message || String(error);
      const spawnFailSpan = startSpan('cli.run-task.spawnAgent', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          fallbackUsed,
          command: limitText(fullCommand),
          timeoutMs: agentCliTimeout,
        },
      });
      await spawnFailSpan.fail(error, {
        stdoutLength: errStdout.length,
        stderrLength: errStderr.length,
        exitCode: execError.code ?? null,
      });
      const gitChanges = await collectGitChanges() ?? undefined;
      audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'FAILED', 'run-task');
      logger.error(`任务执行失败: ${errOutput}`);
      return { success: false, output: errOutput, command: fullCommand, gitChanges, agentTaskContract: agentTaskContractSummary };
    }
  }, {
    context: incomingContext || undefined,
    source: 'cli',
    attributes: baseAttributes,
  });
}

export const runTaskCmd = new Command('run-task')
  .description('执行文档任务：根据任务描述和 Agent CLI 工具生成并执行命令')
  .option('--tool <name>', 'Agent CLI 工具名称（如 aider、claude）')
  .requiredOption('--task-id <id>', '任务编号')
  .option('--task-label <label>', '任务描述')
  .option('--doc <path>', '参考文档路径')
  .option('--dry-run', '仅生成命令，不实际执行')
  .option('--contract-preview', '只生成任务边界合同摘要，不加载 LLM、不执行 Agent')
  .option('--json', '以 JSON 格式输出')
  .action(async (options: {
    tool?: string;
    taskId: string;
    taskLabel?: string;
    doc?: string;
    dryRun?: boolean;
    contractPreview?: boolean;
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
