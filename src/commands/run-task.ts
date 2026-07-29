import { Command } from 'commander';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { getSecurityGuard } from '../security-protocol/factory.js';
import type { SecurityContext, CommandIntention } from '../types/security.js';
import { assessCommandRisk } from '../security-protocol/engine.js';
import { getTraceContextFromEnv, startSpan, type SpanHandle } from '../infrastructure/trace/index.js';
import { deriveAgentTaskBoundary, deriveDocExcerpt, computeInstructionHash } from './agent-task-contract.js';
import type { AgentTaskContract } from '../types/doc-task.js';
import { splitPosixArgs } from '../utils/shell.js';
import { djb2Hash } from '../infrastructure/paths/index.js';
import { getAgentDescriptorById } from './agent-cli-adapter.js';
import {
  createRunTaskReviewReport,
  RunTaskReviewStatus,
  type RunTaskReviewFinding,
  type RunTaskReviewReport,
} from './run-task-review.js';
import { decideRecovery, type RecoveryDecision, type RecoveryDecisionKind, type RecoveryDecisionMode } from '../types/recovery.js';
import type { DocTaskFailureKind } from '../types/doc-task.js';
import {
  combineRuntimeEstimates,
  type TaskRuntimeEstimate,
  type TaskRuntimeFeatureInput,
} from './run-task-runtime-estimator.js';
import {
  createRuntimeSampleStore,
  createRuntimeSample,
} from './run-task-runtime-sample-store.js';
import { createTransport, type AcpConfig } from '../agent-runtime/transport/factory.js';
import { executeViaAcpTransport } from './run-task-acp.js';

let boundContext: InfrastructureContext | null = null;

interface RunTaskCommandOutput {
  log(message?: unknown): void;
  json(payload: unknown, options?: { space?: number }): void;
  renderedJson(rendered: string): void;
}

function createRunTaskCommandOutput(): RunTaskCommandOutput {
  return {
    log(message?: unknown): void {
      process.stdout.write(`${message === undefined ? '' : String(message)}\n`);
    },
    json(payload: unknown, options?: { space?: number }): void {
      process.stdout.write(`${JSON.stringify(payload, null, options?.space ?? 2)}\n`);
    },
    renderedJson(rendered: string): void {
      process.stdout.write(`${rendered}\n`);
    },
  };
}

function getContext() {
  if (!boundContext) {
    throw new Error('run-task context is not bound. Use bindRunTaskContext(context) first.');
  }
  return boundContext;
}

/**
 * 绑定运行任务的基础设施上下文
 * @param context - 基础设施上下文实例
 */
export function bindRunTaskContext(context: InfrastructureContext): void {
  boundContext = context;
}

function getLogger() {
  return getContext().logger.getLogger('run-task');
}

function getAuditHelper() {
  return getContext().audit.getHelper();
}

function createBoundRunTaskLogger(context: InfrastructureContext) {
  return context.logger.getLogger('run-task');
}


const DEFAULT_AGENT_CLI_TIMEOUT = 600000;
function getAgentCliTimeout(): number {
  return getContext().environment.getEnvNumber('AGENT_CLI_TIMEOUT', DEFAULT_AGENT_CLI_TIMEOUT) ?? DEFAULT_AGENT_CLI_TIMEOUT;
}
const DEFAULT_MAX_JSON_OUTPUT_LENGTH = 50000;
function getMaxJsonOutputLength(): number {
  if (!boundContext) {
    return DEFAULT_MAX_JSON_OUTPUT_LENGTH;
  }
  return boundContext.environment.getEnvNumber('RUN_TASK_MAX_JSON_OUTPUT_LENGTH', DEFAULT_MAX_JSON_OUTPUT_LENGTH) ?? DEFAULT_MAX_JSON_OUTPUT_LENGTH;
}
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
  /xterm\.js:\s*parsing error.*/i,
];
const TRACE_TEXT_MAX_LENGTH = 500;
const PROMPT_CONTRACT_MAX_LENGTH = 12000;
const MAX_VERIFICATION_COMMANDS = 10;
const VERIFICATION_SUMMARY_MAX_LENGTH = 600;
const FAILURE_HUMAN_SUMMARY_MAX_LENGTH = 600;



export interface GitChangeInfo {
  diffStat: string;
  shortStat: string;
  changedFiles: string[];
}

interface GitDiffSnapshot {
  diffStat: string;
  shortStat: string;
  changedFiles: string[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RunTaskResult {
  success: boolean;
  output: string;
  command: string;
  commandGenerationPath?: 'adapter' | 'llm-fallback' | 'acp';
  fallbackUsed?: boolean;
  agentExecutionOutcome?: 'implemented' | 'planned_only';
  error?: {
    code: string;
    message: string;
  };
  gitChanges?: GitChangeInfo;
  agentTaskContract?: AgentTaskContractSummary;
  verification?: VerificationResult;
  riskAssessment?: RunTaskRiskAssessment;
  usage?: TokenUsage;
  failureKind?: DocTaskFailureKind;
  unclosedExecution?: boolean;
  completionSignal?: SpawnCompletionSignal;
  recoveryDecision?: RunTaskRecoveryDecisionSummary;
  reviewReport?: RunTaskReviewReport;
  warning?: {
    level: 'related' | 'out_of_scope';
    reason: string;
    matchedFiles: string[];
  };
  llmReview?: {
    verdict: 'pass' | 'warn' | 'fail';
    reason: string;
    confidence: number;
    humanFeedback: 'agree' | 'disagree' | 'override_pass' | 'override_fail';
  };
}

export interface RunTaskRiskAssessment {
  level: string;
  ruleName?: string;
  needsConfirmation: boolean;
  enforcement?: 'blocked' | 'confirm_required';
  phase?: 'command' | 'verification';
  blockedCommand?: string;
  confirmationSource?: 'preflight' | 'post-execution';
}

export interface RunTaskJsonResult {
  ok: boolean;
  command: string;
  output: string;
  outputTruncated: boolean;
  displayOutput?: string;
  commandGenerationPath?: 'adapter' | 'llm-fallback' | 'acp';
  fallbackUsed?: boolean;
  agentExecutionOutcome?: 'implemented' | 'planned_only';
  agentTaskContract?: AgentTaskContractSummary;
  gitChanges?: {
    shortStat: string;
    changedFiles: string[];
    diffStat: string;
  };
  verification?: VerificationResult;
  riskAssessment?: RunTaskRiskAssessment;
  usage?: TokenUsage;
  failureKind?: DocTaskFailureKind;
  unclosedExecution?: boolean;
  completionSignal?: SpawnCompletionSignal;
  recoveryDecision?: RunTaskRecoveryDecisionSummary;
  reviewReport?: RunTaskReviewReport;
  warning?: {
    level: 'related' | 'out_of_scope';
    reason: string;
    matchedFiles: string[];
  };
  llmReview?: {
    verdict: 'pass' | 'warn' | 'fail';
    reason: string;
    confidence: number;
    humanFeedback: 'agree' | 'disagree' | 'override_pass' | 'override_fail';
  };
  error?: string | {
    code: string;
    message: string;
  };
}

export interface RunTaskHumanOutputOptions {
  mode?: 'default' | 'contract-preview' | 'dry-run';
}

export interface RunTaskRecoveryDecisionSummary {
  kind: RecoveryDecisionKind;
  mode: RecoveryDecisionMode;
  summary: string;
}

interface RunTaskTraceCloseout {
  rootSpan: SpanHandle;
  traceContext: { traceId: string; source: 'cli' };
  baseAttributes: Record<string, unknown>;
}

const RUN_TASK_TRACE_CLOSEOUT = Symbol('runTaskTraceCloseout');

function attachRunTaskTraceCloseout<T extends object>(target: T, closeout: RunTaskTraceCloseout): T {
  Object.defineProperty(target, RUN_TASK_TRACE_CLOSEOUT, {
    value: closeout,
    enumerable: false,
    configurable: true,
  });
  return target;
}

function getRunTaskTraceCloseout(target: object): RunTaskTraceCloseout | undefined {
  return (target as { [RUN_TASK_TRACE_CLOSEOUT]?: RunTaskTraceCloseout })[RUN_TASK_TRACE_CLOSEOUT];
}

export interface AgentTaskContractSummary {
  boundaryConfidence: AgentTaskContract['boundaryConfidence'];
  allowedFiles: string[];
  forbiddenFiles: string[];
  relatedFiles: string[];
  validationCommands: string[];
  executionMode: AgentTaskContract['executionMode'];
  docExcerptTruncated: boolean;
  excerptStrategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback' | 'none';
  instructionHash: string;
  globalConfigDigest?: string;
}

export interface VerificationCommandResult {
  command: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdoutSummary?: string;
  stderrSummary?: string;
  outputTruncated?: boolean;
}

export interface VerificationResult {
  ok: boolean;
  commands: VerificationCommandResult[];
  isSystemError?: boolean;
}

type SpawnCompletionSignal = 'close' | 'exit-stream-drain' | 'exit-flush-grace' | 'output-last-message' | 'evidence-closeout' | 'timeout';



/**
 * 构建默认的任务提示词
 * @param taskId - 任务 ID
 * @param taskLabel - 任务标签
 * @param docPath - 文档路径
 * @param contract - 任务合同
 * @returns 构建好的提示词字符串
 */
export function buildDefaultPrompt(taskId: string, taskLabel: string, docPath: string, contract: AgentTaskContract): string {
  const shouldEnforceMinimalChange = !contract.docExcerpt || contract.boundaryConfidence === 'none' || contract.boundaryConfidence === 'low';
  const docExcerptText = contract.docExcerpt || '(未提供文档片段)';
  const additionalGuidance = shouldEnforceMinimalChange
    ? [
      '- 当前文档片段缺失或边界可信度较低；仅允许最小改动。',
      '- 若无法在允许修改范围内完成，输出阻塞说明并停止，不要扩大改动范围。',
    ]
    : [
      '- 优先基于文档片段执行；仅在片段不足且不越过允许修改范围时，再补充引用参考文档路径。',
    ];
  const prompt = [
    '请基于任务边界合同执行任务；合同是主输入。',
    '',
    `任务编号：${taskId}`,
    `任务描述：${taskLabel}`,
    '',
    '任务边界合同：',
    `文档片段：\n${docExcerptText}`,
    '',
    `允许修改范围：${formatListForPrompt(contract.allowedFiles, '未推导出明确文件，请保持最小改动并在输出中说明实际修改文件')}`,
    `禁止修改范围：${formatListForPrompt(contract.forbiddenFiles, '未配置')}`,
    `建议验证命令：${formatListForPrompt(contract.validationCommands, 'npm run typecheck')}`,
    `边界可信度：${contract.boundaryConfidence}`,
    `参考文档路径（补充引用）：${docPath}`,
    '',
    '执行要求：',
    '- 只围绕当前任务改动。',
    '- 优先修改允许修改范围内的文件。',
    '- 不要修改禁止修改范围内的文件。',
    ...additionalGuidance,
    '- 完成后运行或说明建议验证命令。',
    '',
    '执行步骤：',
    `1. 先按任务边界合同中的字段完成任务 ${taskId}`,
    `2. 仅在片段不足且边界允许时，补充引用 ${docPath} 的必要上下文`,
    '3. 保持与现有代码风格一致，并运行建议验证命令',
  ].join('\n');

  if (prompt.length <= PROMPT_CONTRACT_MAX_LENGTH) {
    return prompt;
  }
  return `${prompt.slice(0, PROMPT_CONTRACT_MAX_LENGTH).trimEnd()}\n... (prompt contract truncated)`;
}

async function readGitDiffSnapshot(): Promise<GitDiffSnapshot | null> {
  try {
    const { stdout: shortStat } = await getContext().environment.exec('git diff --shortstat');
    const { stdout: statusShort } = await getContext().environment.exec('git status --short');
    const untrackedFiles = statusShort.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('?? '))
      .map(line => line.slice(3).trim())
      .filter(Boolean);
    if (!shortStat.trim() && untrackedFiles.length === 0) return null;

    const { stdout: diffStat } = shortStat.trim()
      ? await getContext().environment.exec('git diff --stat')
      : { stdout: '' };
    const changedFiles = diffStat.split('\n')
      .map(line => {
        const parts = line.split('|');
        return parts[0]?.trim() || '';
      })
      .filter(f => f && !f.includes('file') && !f.includes('changed'));
    const allChangedFiles = Array.from(new Set([...changedFiles, ...untrackedFiles]));

    return {
      diffStat: [diffStat.trim(), ...untrackedFiles.map(file => `${file} | untracked`)]
        .filter(Boolean)
        .join('\n')
        .substring(0, 3000),
      shortStat: shortStat.trim() || `${untrackedFiles.length} untracked file${untrackedFiles.length > 1 ? 's' : ''}`,
      changedFiles: allChangedFiles,
    };
  } catch {
    return null;
  }
}

/**
 * 收集 Git 变更信息
 * @param before - 任务执行前的 Git 快照
 * @returns Git 变更信息，如果无法获取则返回 null
 */
export async function collectGitChanges(before?: GitDiffSnapshot | null): Promise<GitChangeInfo | null> {
  const after = await readGitDiffSnapshot();
  if (!after) return null;
  if (!before) return after;

  const previousFiles = new Set(before.changedFiles);
  const changedFiles = after.changedFiles.filter(file => !previousFiles.has(file));
  if (changedFiles.length === 0) {
    return null;
  }

  return {
    shortStat: `${changedFiles.length} file${changedFiles.length > 1 ? 's' : ''} changed (task delta)`,
    diffStat: changedFiles.join('\n'),
    changedFiles,
  };
}

function compactAgentOutput(output: string): { output: string; truncated: boolean } {
  const cleanedLines = output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .filter(line => !NOISY_OUTPUT_PATTERNS.some(pattern => pattern.test(line)));

  const compacted = cleanedLines.join('\n').trim();
  if (compacted.length <= getMaxJsonOutputLength()) {
    return { output: compacted, truncated: compacted.length !== output.trim().length };
  }

  return {
    output: truncateAtLineBoundary(compacted, getMaxJsonOutputLength()),
    truncated: true,
  };
}

function sanitizeUserVisibleLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const hiddenPrefixes = [
    'trace',
    'span',
    'session',
    'prompt',
    'messages',
    'conversation',
    'assistant',
    'user',
    'system',
    'tool',
    'stdout',
    'stderr',
    'diff --git',
    'index ',
    '@@',
    'openai codex',
    'workdir:',
    'model:',
    'provider:',
    'approval:',
    'sandbox:',
    'reasoning effort:',
    'reasoning summaries:',
    'tokens used',
    '任务编号：',
    '任务描述：',
    '文档片段：',
    '执行要求：',
    'codex',
  ];
  if (hiddenPrefixes.some(prefix => lower.startsWith(prefix))) {
    return null;
  }

  const hiddenFragments = [
    'task boundary contract',
    '任务边界合同',
    '参考文档路径',
    '允许修改范围',
    '禁止修改范围',
    '建议验证命令',
    '边界可信度',
    '执行步骤',
    '请基于任务边界合同执行任务',
    '未提供文档片段',
    'yolo mode is enabled',
    'completion_tokens',
    'prompt_tokens',
    'messages":',
    '"role":',
    '"content":',
    '"session"',
    '"trace"',
    '"prompt"',
    'warn codex_',
    'startup remote plugin sync failed',
    'state db discrepancy',
    'failed to warm featured plugin ids cache',
  ];
  if (hiddenFragments.some(fragment => lower.includes(fragment))) {
    return null;
  }

  if (/^(##+|\d+\.)\s/.test(trimmed)) {
    return null;
  }
  if (/^-{3,}$/.test(trimmed)) {
    return null;
  }
  if (/^[-*]\s+(allow|forbid|validation|task|trace|session|prompt)\b/i.test(trimmed)) {
    return null;
  }
  if (/^[-*]\s+(\[REDACTED\]|\.env|src\/|docs\/|\*\*\/|node_modules|\.git|npm\s+|npx\s+|只围绕|优先|不要|完成后|当前文档|若无法)/i.test(trimmed)) {
    return null;
  }
  if (/^\d[\d,]*$/.test(trimmed)) {
    return null;
  }
  if (/[`{}[\]]/.test(trimmed) && trimmed.length > 120) {
    return null;
  }

  return trimmed;
}

function buildUserVisibleSummary(output: string): { output: string; truncated: boolean } {
  const compacted = compactAgentOutput(output);
  const candidateLines = compacted.output
    .split(/\r?\n/)
    .map(sanitizeUserVisibleLine)
    .filter((line): line is string => Boolean(line));

  const uniqueLines = Array.from(new Set(candidateLines));
  const selectedLines = uniqueLines.slice(0, 6);
  const summarySource = selectedLines.join('\n').trim();
  if (!summarySource) {
    return compacted;
  }

  const maxSummaryLength = Math.min(getMaxJsonOutputLength(), 1200);
  const omittedLines = selectedLines.length < uniqueLines.length;
  const summary = summarySource.length > maxSummaryLength
    ? truncateAtLineBoundary(summarySource, maxSummaryLength)
    : omittedLines
      ? `${summarySource}${TRUNCATED_OUTPUT_MARKER}`
      : summarySource;

  return {
    output: summary,
    truncated: compacted.truncated || omittedLines || summary.length < summarySource.length,
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

function buildDryRunPrompt(taskId: string, label: string, contractSummary: AgentTaskContractSummary): string {
  return [
    `任务编号：${taskId}`,
    `任务描述：${label}`,
    'dry-run 预览：',
    `允许修改范围：${formatListForPrompt(contractSummary.allowedFiles, '未推导出明确文件')}`,
    `禁止修改范围：${formatListForPrompt(contractSummary.forbiddenFiles, '未配置')}`,
    `建议验证命令：${formatListForPrompt(contractSummary.validationCommands, 'npm run typecheck')}`,
  ].join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function docExcerptContainsTaskId(docExcerpt: string, taskId: string): boolean {
  const escapedTaskId = escapeRegExp(taskId);
  return new RegExp(`(^|[^\\w.-])${escapedTaskId}([^\\w.-]|$)`).test(docExcerpt);
}

async function buildAgentTaskContract(input: {
  taskId: string;
  label: string;
  docPath?: string;
  projectRoot: string;
  tool?: string;
  globalConfigDigest?: string;
}): Promise<AgentTaskContract & { summary: AgentTaskContractSummary }> {
  let docExcerpt = '';
  let docExcerptTruncated = false;
  let excerptStrategy: AgentTaskContractSummary['excerptStrategy'] = 'none';
  const notes: string[] = [];

  if (input.docPath && getContext().environment.exists(input.docPath)) {
    const excerpt = await deriveDocExcerpt(getContext(), {
      docPath: input.docPath,
      taskId: input.taskId,
      label: input.label,
    });
    docExcerpt = excerpt.excerpt;
    docExcerptTruncated = excerpt.truncated;
    excerptStrategy = excerpt.strategy;
    if (excerptStrategy === 'head-fallback' || !docExcerptContainsTaskId(docExcerpt, input.taskId)) {
      throw new Error(`Task contract not found in doc: taskId=${input.taskId}, docPath=${input.docPath}`);
    }
  } else if (input.docPath) {
    notes.push('doc-not-found');
  } else {
    notes.push('doc-not-provided');
  }

  const boundary = deriveAgentTaskBoundary({
    docExcerpt,
    label: input.label,
    projectRoot: input.projectRoot,
    packageScripts: readPackageScripts(input.projectRoot),
  });
  const executionMode: AgentTaskContract['executionMode'] = boundary.parallelEligible
    ? 'parallel-eligible'
    : 'serial';
  const instructionHash = computeInstructionHash(
    input.taskId,
    input.label,
    docExcerpt,
    input.tool,
    boundary.allowedFiles,
    boundary.forbiddenFiles,
    input.globalConfigDigest,
  );
  const contract: AgentTaskContract = {
    taskId: input.taskId,
    label: input.label,
    instructionHash,
    docPath: input.docPath,
    docExcerpt,
    allowedFiles: boundary.allowedFiles,
    forbiddenFiles: boundary.forbiddenFiles,
    validationCommands: boundary.validationCommands,
    timeoutMs: getAgentCliTimeout(),
    executionMode,
    boundaryConfidence: boundary.boundaryConfidence,
    notes: boundary.reason ? [...notes, boundary.reason] : notes,
  };
  const summary: AgentTaskContractSummary = {
    boundaryConfidence: contract.boundaryConfidence,
    allowedFiles: contract.allowedFiles,
    forbiddenFiles: contract.forbiddenFiles,
    relatedFiles: boundary.relatedFiles ?? [],
    validationCommands: contract.validationCommands,
    executionMode: contract.executionMode,
    docExcerptTruncated,
    excerptStrategy,
    instructionHash: contract.instructionHash,
    globalConfigDigest: input.globalConfigDigest,
  };

  return { ...contract, summary };
}

function readPackageScripts(projectRoot: string): string[] {
  try {
    const packageJsonPath = getContext().environment.resolvePath(projectRoot, 'package.json');
    const packageJson = JSON.parse(getContext().environment.readFile(packageJsonPath)) as {
      scripts?: Record<string, unknown>;
    };
    return Object.keys(packageJson.scripts ?? {});
  } catch {
    return [];
  }
}

/**
 * Parse token usage from Agent CLI output.
 * Looks for common patterns like: "tokens": {"prompt": N, "completion": N, "total": N}
 * or usage.prompt_tokens / usage.completion_tokens
 */

function truncateVerificationSummary(value: string | undefined): string | undefined {
  if (!value || value.length <= VERIFICATION_SUMMARY_MAX_LENGTH) return value;
  const suffix = '...';
  return `${value.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH - suffix.length)}${suffix}`;
}

/**
 * 分割命令行参数字符串
 * @param cmd - 命令行参数字符串
 * @returns 分割后的参数数组
 * @throws VectaHubError 如果引号未闭合
 */
export function splitCommandArgs(cmd: string): string[] {
  if (/[^\s]/.test(cmd) && (cmd.match(/(?<!\\)"/g)?.length ?? 0) % 2 !== 0) {
    throw new VectaHubError('Unclosed double quote in command', ErrorType.RUNTIME);
  }
  if (/[^\s]/.test(cmd) && (cmd.match(/(?<!\\)'/g)?.length ?? 0) % 2 !== 0) {
    throw new VectaHubError('Unclosed single quote in command', ErrorType.RUNTIME);
  }
  return splitPosixArgs(cmd);
}

function getRunTaskOutputDir(): string {
  return getContext().environment.getPath('outputs', 'run-task', djb2Hash(getContext().environment.getCwd()));
}

function getRunTaskOutputDirCandidates(): string[] {
  const preferredDir = getRunTaskOutputDir();
  const fallbackDir = getContext().environment.resolvePath(getContext().environment.getTmpDir(), 'vectahub', 'outputs', 'run-task', djb2Hash(getContext().environment.getCwd()));
  return Array.from(new Set(preferredDir === fallbackDir ? [preferredDir] : [preferredDir, fallbackDir]));
}

async function ensureRunTaskOutputDir(): Promise<string> {
  let lastError: unknown;
  for (const outputDir of getRunTaskOutputDirCandidates()) {
    try {
      await getContext().environment.mkdirAsync(outputDir, { recursive: true });
      return outputDir;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to create run-task output directory');
}



type RunTaskOutputStreamKind = 'stdout' | 'stderr';

interface RunTaskOutputEntry {
  path: string;
  timestamp: number;
  taskId: string;
  stream: RunTaskOutputStreamKind;
}

export interface RunTaskLogCleanupResult {
  removedFiles: number;
}

function parseRunTaskOutputEntry(outputDir: string, fileName: string): RunTaskOutputEntry | null {
  const match = /^(.*)-(\d+)\.(stdout|stderr)$/.exec(fileName);
  if (!match) {
    return null;
  }

  const timestamp = Number(match[2]);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return {
    path: getContext().environment.resolvePath(outputDir, fileName),
    timestamp,
    taskId: match[1],
    stream: match[3] as RunTaskOutputStreamKind,
  };
}

function listRunTaskOutputEntries(outputDir: string): RunTaskOutputEntry[] {
  return getContext().environment.readDir(outputDir)
    .map(fileName => parseRunTaskOutputEntry(outputDir, fileName))
    .filter((entry): entry is RunTaskOutputEntry => entry !== null);
}

const RUN_TASK_FAILURE_LOG_RETENTION_DAYS = 7;

function getRunTaskFailureLogRetentionCutoff(now: number = Date.now()): number {
  return now - (RUN_TASK_FAILURE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * 清理运行任务日志文件
 * @param options - 清理选项
 * @param options.olderThanMs - 清理指定毫秒数之前的日志
 * @returns 清理结果
 */
export async function cleanRunTaskLogs(options?: { olderThanMs?: number }): Promise<RunTaskLogCleanupResult> {
  let removedFiles = 0;

  for (const outputDir of getRunTaskOutputDirCandidates()) {
    if (!getContext().environment.exists(outputDir)) {
      continue;
    }

    const removableEntries = listRunTaskOutputEntries(outputDir)
      .filter(entry => options?.olderThanMs === undefined || entry.timestamp < options.olderThanMs);

    for (const entry of removableEntries) {
      getContext().environment.rm(entry.path, { force: true });
      removedFiles += 1;
    }
  }

  return { removedFiles };
}

async function pruneExpiredRunTaskLogs(): Promise<RunTaskLogCleanupResult> {
  return cleanRunTaskLogs({
    olderThanMs: getRunTaskFailureLogRetentionCutoff(),
  });
}

async function persistRunTaskFailureLogs(taskId: string, output: { stdout?: string; stderr?: string }): Promise<void> {
  const stdout = output.stdout ?? '';
  const stderr = output.stderr ?? '';
  if (!stdout && !stderr) {
    return;
  }

  const outputDir = await ensureRunTaskOutputDir();
  const timestamp = Date.now();
  if (stdout) {
    const stdoutPath = getContext().environment.resolvePath(outputDir, `${taskId}-${timestamp}.stdout`);
    getContext().environment.writeFile(stdoutPath, stdout);
  }
  if (stderr) {
    const stderrPath = getContext().environment.resolvePath(outputDir, `${taskId}-${timestamp}.stderr`);
    getContext().environment.writeFile(stderrPath, stderr);
  }
}



function isUnclosedExecutionFailure(input: {
  success: boolean;
  gitChanges?: GitChangeInfo;
  verification?: VerificationResult;
}): boolean {
  const changedFileCount = input.gitChanges?.changedFiles.length ?? 0;
  return !input.success && changedFileCount > 0 && input.verification === undefined;
}


function buildRecoveryDecisionSummary(input: {
  failureKind?: DocTaskFailureKind;
  gitChanges?: GitChangeInfo;
  verification?: VerificationResult;
  agentTaskContract?: AgentTaskContractSummary;
}): RunTaskRecoveryDecisionSummary | undefined {
  if (!input.failureKind) {
    return undefined;
  }

  const decision = decideRecovery({
    runId: 'run-task',
    taskId: 'run-task',
    taskLabel: 'run-task',
    failureKind: input.failureKind,
    status: failureKindToStatus(input.failureKind),
    gitChanges: input.gitChanges
      ? {
          changedFileCount: input.gitChanges.changedFiles.length,
          changedFiles: input.gitChanges.changedFiles,
          shortStat: input.gitChanges.shortStat,
        }
      : undefined,
    verification: input.verification
      ? {
          ok: input.verification.ok,
          totalCommands: input.verification.commands.length,
          passedCommands: input.verification.commands.filter(command => command.ok).length,
          failedCommands: input.verification.commands.filter(command => !command.ok).length,
          failedCommandSummary: input.verification.commands
            .filter(command => !command.ok)
            .map(command => command.command)
            .slice(0, 3)
            .join('; ') || undefined,
        }
      : undefined,
    agentTaskContract: input.agentTaskContract
      ? {
          boundaryConfidence: input.agentTaskContract.boundaryConfidence,
          allowedFileCount: input.agentTaskContract.allowedFiles.length,
          forbiddenFileCount: input.agentTaskContract.forbiddenFiles.length,
          validationCommandCount: input.agentTaskContract.validationCommands.length,
          executionMode: input.agentTaskContract.executionMode,
        }
      : undefined,
  });

  return summarizeRecoveryDecision(decision);
}


function didRunTaskValidationPass(
  verification: VerificationResult | undefined,
  contract: AgentTaskContractSummary,
): boolean {
  if (contract.validationCommands.length === 0) {
    return true;
  }
  return !!verification && verification.ok && !verification.isSystemError;
}

function buildRunTaskReviewReport(input: {
  taskId: string;
  taskLabel: string;
  contract?: AgentTaskContractSummary;
  gitChanges?: GitChangeInfo;
  verification?: VerificationResult;
  agentExecutionOutcome?: 'implemented' | 'planned_only';
  alreadySatisfied?: boolean;
  llmReview?: {
    verdict: 'pass' | 'warn' | 'fail';
    reason: string;
    confidence: number;
  };
}): RunTaskReviewReport | undefined {
  if (!input.contract || !input.agentExecutionOutcome) {
    return undefined;
  }

  return createRunTaskReviewReport({
    taskId: input.taskId,
    taskLabel: input.taskLabel,
    allowedFiles: input.contract.allowedFiles,
    forbiddenFiles: input.contract.forbiddenFiles,
    changedFiles: input.gitChanges?.changedFiles ?? [],
    validationPassed: didRunTaskValidationPass(input.verification, input.contract),
    agentExecutionOutcome: input.agentExecutionOutcome,
    alreadySatisfied: input.alreadySatisfied,
    llmReview: input.llmReview,
  });
}

function summarizeRecoveryDecision(decision: RecoveryDecision): RunTaskRecoveryDecisionSummary {
  return {
    kind: decision.kind,
    mode: decision.mode,
    summary: decision.summary,
  };
}

function failureKindToStatus(kind: DocTaskFailureKind): 'failed_config' | 'failed_agent' | 'failed_json_protocol' | 'failed_timeout' | 'failed_test' | 'failed_conflict' | 'failed_system_internal' | 'cancelled' {
  const map: Record<DocTaskFailureKind, 'failed_config' | 'failed_agent' | 'failed_json_protocol' | 'failed_timeout' | 'failed_test' | 'failed_conflict' | 'failed_system_internal' | 'cancelled'> = {
    config: 'failed_config',
    agent: 'failed_agent',
    json_protocol: 'failed_json_protocol',
    timeout: 'failed_timeout',
    test: 'failed_test',
    conflict: 'failed_conflict',
    system_internal: 'failed_system_internal',
    cancelled: 'cancelled',
    unknown: 'failed_agent',
  };
  return map[kind];
}

async function detectValidationPreflightRisk(
  validationCommands: string[],
  context: SecurityContext
): Promise<RunTaskRiskAssessment | null> {
  const guard = getSecurityGuard();
  const commandsToCheck = validationCommands.slice(0, MAX_VERIFICATION_COMMANDS);
  for (const cmd of commandsToCheck) {
    const intention: CommandIntention = { rawCommand: cmd };
    const decision = await guard.assess(intention, context);
    
    if (decision.decision === 'BLOCKED' || decision.decision === 'REQUIRES_CONFIRMATION') {
      return {
        level: decision.riskLevel,
        ruleName: decision.ruleName,
        needsConfirmation: true,
        enforcement: 'confirm_required',
        phase: 'verification',
        confirmationSource: 'preflight',
        blockedCommand: limitText(cmd),
      };
    }
    const risk = await assessCommandRisk(cmd);
    if (risk.needsConfirmation || risk.level === 'critical' || risk.level === 'high') {
      return {
        level: risk.level,
        ruleName: risk.ruleName,
        needsConfirmation: true,
        enforcement: 'confirm_required',
        phase: 'verification',
        confirmationSource: 'preflight',
        blockedCommand: limitText(cmd),
      };
    }
  }
  return null;
}

function normalizeContractPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function detectPostExecutionConfirmation(input: {
  gitChanges?: GitChangeInfo;
  allowedFiles: string[];
  forbiddenFiles: string[];
  relatedFiles: string[];
}): { level: 'forbidden' | 'related' | 'out_of_scope'; reason: string; matchedFiles: string[] } | null {
  const changedFiles = input.gitChanges?.changedFiles ?? [];
  if (!changedFiles.length) {
    return null;
  }

  const normalizedChanged = changedFiles.map(normalizeContractPath);
  const allowed = new Set(input.allowedFiles.map(normalizeContractPath).filter(Boolean));
  const forbidden = new Set(input.forbiddenFiles.map(normalizeContractPath).filter(Boolean));
  const related = new Set(input.relatedFiles.map(normalizeContractPath).filter(Boolean));
  const isForbiddenMatch = (file: string): boolean => {
    if (forbidden.has(file)) return true;
    for (const pattern of forbidden) {
      if (!pattern.includes('*')) continue;
      if (pattern.startsWith('**/')) {
        const suffix = pattern.slice(3);
        if (suffix.endsWith('/**')) {
          const dir = suffix.slice(0, -3);
          if (dir && file.includes(`/${dir}/`)) return true;
          if (dir && file.startsWith(`${dir}/`)) return true;
          continue;
        }
        if (suffix.startsWith('*.')) {
          const ext = suffix.slice(1);
          if (ext && file.endsWith(ext)) return true;
          continue;
        }
      }
      if (pattern === '.env.*' && file.startsWith('.env.')) {
        return true;
      }
    }
    return false;
  };

  const forbiddenMatches = normalizedChanged.filter(file => isForbiddenMatch(file));
  if (forbiddenMatches.length > 0) {
    return {
      level: 'forbidden',
      reason: 'forbidden_files_modified',
      matchedFiles: forbiddenMatches,
    };
  }

  if (related.size > 0) {
    const relatedMatches = normalizedChanged.filter(file => related.has(file));
    if (relatedMatches.length > 0) {
      return {
        level: 'related',
        reason: 'related_file_changes',
        matchedFiles: relatedMatches,
      };
    }
  }

  if (allowed.size > 0) {
    const outOfScope = normalizedChanged.filter(file => !allowed.has(file));
    if (outOfScope.length > 0) {
      return {
        level: 'out_of_scope',
        reason: 'out_of_scope_changes',
        matchedFiles: outOfScope,
      };
    }
  }

  return null;
}




/**
 * 运行验证命令
 * @param validationCommands - 验证命令列表
 * @param cwd - 工作目录
 * @param context - 基础设施上下文（可选）
 * @returns 验证结果
 */
export async function runVerificationCommands(
  validationCommands: string[],
  cwd: string,
  context?: InfrastructureContext,
): Promise<VerificationResult> {
  const resolvedContext = context ?? getContext();
  const guard = getSecurityGuard();
  const securityContext: SecurityContext = {
    cwd,
    sessionId: 'verification-session', // 在验证阶段使用固定会话标识
  };
  const commandsToRun = validationCommands.slice(0, MAX_VERIFICATION_COMMANDS);
  const results: VerificationCommandResult[] = [];
  let overallOk = true;
  let hasSystemError = false;

  for (const cmd of commandsToRun) {
    // 使用新的安全防线进行风险评估
    const intention: CommandIntention = { rawCommand: cmd };
    const decision = await guard.assess(intention, securityContext);

    if (decision.decision === 'BLOCKED') {
      resolvedContext.logger.getLogger('run-task').warn(`验证命令被安全策略阻断 (critical): ${cmd} — ${decision.reason || ''}`);
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }

    if (decision.decision === 'REQUIRES_CONFIRMATION') {
      // 在自动验证流程中，如果不具备交互能力，高风险命令视为阻断
      resolvedContext.logger.getLogger('run-task').warn(`验证命令需要人工确认，在自动流程中已被跳过: ${cmd}`);
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }

    const startMs = Date.now();
    try {
      const { stdout, stderr } = await resolvedContext.environment.exec(cmd, {
        cwd,
      });
      const durationMs = Date.now() - startMs;
      const stdoutStr = stdout?.toString?.() || '';
      const stderrStr = stderr?.toString?.() || '';
      const outputTruncated = stdoutStr.length > VERIFICATION_SUMMARY_MAX_LENGTH || stderrStr.length > VERIFICATION_SUMMARY_MAX_LENGTH;
      results.push({
        command: cmd,
        ok: true,
        exitCode: 0,
        durationMs,
        stdoutSummary: truncateVerificationSummary(stdoutStr),
        stderrSummary: truncateVerificationSummary(stderrStr),
        outputTruncated,
      });
    } catch (error) {
      const durationMs = Date.now() - startMs;
      const execError = error as Error & { code?: string | number; stdout?: string | Buffer; stderr?: string | Buffer; status?: number | null; killed?: boolean };
      
      const stdoutStr = execError.stdout?.toString?.() || '';
      const stderrStr = execError.stderr?.toString?.() || '';
      const rawExitCode = execError.status ?? execError.code ?? null;
      const exitCode: number | null = execError.killed ? null : (typeof rawExitCode === 'number' ? rawExitCode : null);
      const errorCode = typeof execError.code === 'string' ? execError.code : undefined;
      const isSystem = ['ENOENT', 'EACCES', 'EPERM'].includes(errorCode || '')
        || exitCode === 127
        || /command not found/i.test(stderrStr)
        || /missing script/i.test(stderrStr);
      if (isSystem) {
        hasSystemError = true;
      }
      const outputTruncated = stdoutStr.length > VERIFICATION_SUMMARY_MAX_LENGTH || stderrStr.length > VERIFICATION_SUMMARY_MAX_LENGTH;
      results.push({
        command: cmd,
        ok: false,
        exitCode,
        durationMs,
        stdoutSummary: truncateVerificationSummary(stdoutStr),
        stderrSummary: truncateVerificationSummary(stderrStr),
        outputTruncated,
      });
      overallOk = false;
    }
  }

  return { ok: overallOk, commands: results, isSystemError: hasSystemError };
}

function copyOptionalFields(
  source: RunTaskResult,
  target: RunTaskJsonResult,
  fields: (keyof RunTaskResult & keyof RunTaskJsonResult)[]
): void {
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined && value !== null) {
      (target as unknown as Record<string, unknown>)[field as string] = value;
    }
  }
}

/**
 * 格式化运行任务结果为 JSON 格式
 * @param result - 运行任务结果
 * @returns 格式化后的 JSON 结果
 */
export function formatRunTaskJson(result: RunTaskResult): RunTaskJsonResult {
  const displayOutput = buildUserVisibleSummary(result.output);
  const jsonResult: RunTaskJsonResult = {
    ok: result.success,
    command: result.command,
    output: displayOutput.output,
    outputTruncated: displayOutput.truncated,
    displayOutput: displayOutput.output,
  };
  if (result.error) {
    jsonResult.error = {
      code: result.error.code,
      message: result.error.message,
    };
  }
  if (result.gitChanges) {
    jsonResult.gitChanges = {
      shortStat: result.gitChanges.shortStat,
      changedFiles: result.gitChanges.changedFiles,
      diffStat: result.gitChanges.diffStat,
    };
  }
  copyOptionalFields(result, jsonResult, [
    'commandGenerationPath',
    'fallbackUsed',
    'agentExecutionOutcome',
    'agentTaskContract',
    'verification',
    'riskAssessment',
    'usage',
    'failureKind',
    'unclosedExecution',
    'completionSignal',
    'recoveryDecision',
    'reviewReport',
    'warning',
    'llmReview',
  ]);

  return jsonResult;
}

function formatHumanList(values: string[], emptyText: string): string {
  if (!values.length) return `- ${emptyText}`;
  return values.map(value => `- ${value}`).join('\n');
}

function formatRunTaskReviewFinding(finding: RunTaskReviewFinding): string {
  const messageMap: Record<string, string> = {
    BROAD_ALLOWED_BOUNDARY: '允许修改边界过宽',
    FORBIDDEN_FILE_CHANGED: '检测到禁止文件变更',
    OUT_OF_SCOPE_FILE_CHANGED: '检测到越界文件变更',
    OUT_OF_SCOPE_LLM_REVIEWED: '越界变更已由 LLM 审查',
    VALIDATION_FAILED: '验证未通过',
    PLANNED_ONLY_OUTCOME: 'Agent 仅输出计划，未落实实现',
    ALREADY_SATISFIED: '任务已满足，无需代码变更',
    NO_CHANGES_RECORDED: '未记录到所需代码变更',
  };
  const summary = messageMap[finding.code] ?? finding.code;
  return finding.evidence ? `${summary}：${finding.evidence}` : summary;
}

function formatRunTaskReviewSummaryForHuman(report?: RunTaskReviewReport): string[] {
  if (!report) {
    return [];
  }

  const statusText = {
    [RunTaskReviewStatus.PASS]: '通过',
    [RunTaskReviewStatus.NEEDS_REVIEW]: '需复核',
    [RunTaskReviewStatus.FAIL]: '未通过',
  } satisfies Record<RunTaskReviewReport['status'], string>;
  const lines = [`审查摘要：${statusText[report.status]}`];

  if (report.findings.length > 0) {
    lines.push(`审查要点：${formatRunTaskReviewFinding(report.findings[0])}`);
  }

  return lines;
}

function formatRunTaskFailureHumanOutput(result: RunTaskResult): string {
  const lines = [
    '任务执行失败',
    '',
    `原因：${result.error?.message || 'Agent 执行失败，但没有明确错误信息。'}`,
  ];

  if (result.error?.code) {
    lines.push(`错误码：${result.error.code}`);
  }
  if (result.failureKind) {
    lines.push(`失败类型：${result.failureKind}`);
  }
  if (result.completionSignal) {
    lines.push(`完成信号：${result.completionSignal}`);
  }
  if (result.unclosedExecution !== undefined) {
    lines.push(`执行是否未收口：${result.unclosedExecution ? '是' : '否'}`);
  }
  if (result.output) {
    lines.push(`已捕获输出：${result.output.length} chars`);
  }
  if (result.recoveryDecision) {
    lines.push(`恢复建议：${result.recoveryDecision.summary}`);
  }
  lines.push(...(result.reviewReport ? ['', ...formatRunTaskReviewSummaryForHuman(result.reviewReport)] : []));

  const summary = buildUserVisibleSummary(result.output);
  if (summary.output) {
    lines.push(
      '',
      '输出摘要：',
      truncateAtLineBoundary(summary.output, FAILURE_HUMAN_SUMMARY_MAX_LENGTH),
    );
  }

  // 失败日志已在执行路径持久化，这里只给控制台摘要，避免 Agent 长输出刷屏。
  lines.push('', '说明：完整 stdout/stderr 已写入失败日志，控制台只显示摘要。');

  return lines.join('\n');
}

function formatVerificationCommandsForHuman(verification?: VerificationResult, contract?: AgentTaskContractSummary): string[] {
  if (verification?.commands.length) {
    return verification.commands.map(command => {
      return `${command.ok ? '通过' : '失败'}：${command.command}`;
    });
  }
  return contract?.validationCommands || [];
}

function formatRunTaskSuccessHumanOutput(result: RunTaskResult): string {
  const contract = result.agentTaskContract;
  const hasStructuredSummary = !!contract || !!result.gitChanges || !!result.verification;
  if (!hasStructuredSummary) {
    const summary = buildUserVisibleSummary(result.output);
    if (summary.output) return summary.output;
    return '任务执行成功，但没有可展示输出。';
  }

  const lines = ['任务执行成功'];

  if (contract) {
    lines.push(
      '',
      '允许修改：',
      formatHumanList(contract.allowedFiles, '未推导出明确文件'),
      '',
      '禁止修改：',
      formatHumanList(contract.forbiddenFiles, '未配置'),
    );
  }

  if (result.gitChanges) {
    lines.push(
      '',
      '实际变更：',
      formatHumanList(result.gitChanges.changedFiles, '未检测到文件变更'),
    );
  }

  const validationCommands = formatVerificationCommandsForHuman(result.verification, contract);
  lines.push(
    '',
    '验证命令：',
    formatHumanList(validationCommands, '未配置验证命令'),
  );

  if (result.agentExecutionOutcome) {
    lines.push('', `Agent 执行判断：${result.agentExecutionOutcome === 'implemented' ? '已实现' : '仅计划'}`);
  }
  lines.push(...(result.reviewReport ? ['', ...formatRunTaskReviewSummaryForHuman(result.reviewReport)] : []));
  if (result.warning) {
    const warningLevelText = result.warning.level === 'related' ? '相关文件' : '越界文件';
    lines.push(
      '',
      `⚠ 边界警告 [${warningLevelText}]`,
      `原因：${result.warning.reason}`,
      '涉及文件：',
      formatHumanList(result.warning.matchedFiles, '无'),
    );
  }
  if (result.llmReview) {
    const verdictText = result.llmReview.verdict === 'pass' ? '通过' : result.llmReview.verdict === 'warn' ? '警告' : '失败';
    const feedbackText = result.llmReview.humanFeedback === 'agree' ? '同意' : result.llmReview.humanFeedback === 'override_pass' ? '覆盖通过' : result.llmReview.humanFeedback === 'override_fail' ? '覆盖失败' : '不同意';
    lines.push(
      '',
      `LLM 审查: ${verdictText} (置信度: ${Math.round(result.llmReview.confidence * 100)}%)`,
      `原因: ${result.llmReview.reason}`,
      `人工反馈: ${feedbackText}`,
    );
  }
  if (result.completionSignal) {
    lines.push(`完成信号：${result.completionSignal}`);
  }
  if (result.commandGenerationPath) {
    lines.push(`命令生成路径：${result.commandGenerationPath}`);
  }

  const summary = buildUserVisibleSummary(result.output);
  if (summary.output) {
    lines.push(
      '',
      'Agent 输出摘要：',
      truncateAtLineBoundary(summary.output, FAILURE_HUMAN_SUMMARY_MAX_LENGTH),
    );
  }

  return lines.join('\n');
}

/**
 * 格式化运行任务结果为人类可读的输出
 * @param result - 运行任务结果
 * @param options - 格式化选项
 * @returns 格式化后的字符串
 */
export function formatRunTaskHumanOutput(result: RunTaskResult, options: RunTaskHumanOutputOptions = {}): string {
  if (options.mode === 'dry-run') {
    return result.output || 'dry-run 预览已生成，但没有可展示内容。';
  }

  if (options.mode === 'contract-preview' && result.agentTaskContract) {
    const contract = result.agentTaskContract;
    const lines = [
      '合同预览',
      '',
      `结论：${result.success ? '可继续评估' : '不建议执行'}`,
      `边界可信度：${contract.boundaryConfidence}`,
      `执行模式：${contract.executionMode}`,
      '',
      '允许修改：',
      formatHumanList(contract.allowedFiles, '未推导出明确文件'),
      '',
      '禁止修改：',
      formatHumanList(contract.forbiddenFiles, '未配置'),
      '',
      '验证命令：',
      formatHumanList(contract.validationCommands, 'npm run typecheck'),
      '',
      `命令生成路径：${result.commandGenerationPath || 'unknown'}`,
      `Fallback：${result.fallbackUsed ? 'yes' : 'no'}`,
    ];

    if (result.error) {
      lines.push('', `错误：${result.error.message}`);
    }

    // 合同预览不展示 docExcerpt，避免把长文档或提示词泄漏到控制台。
    return lines.join('\n');
  }

  if (!result.success) {
    return formatRunTaskFailureHumanOutput(result);
  }

  return formatRunTaskSuccessHumanOutput(result);
}

/**
 * 构建任务运行时特性输入
 * @param contract - 任务合同
 * @param contractSummary - 任务合同摘要
 * @returns 任务运行时特性输入
 */
export function buildTaskRuntimeFeatures(
  contract: AgentTaskContract,
  contractSummary: AgentTaskContractSummary,
): TaskRuntimeFeatureInput {
  const allowed = contractSummary.allowedFiles;
  const validationCmds = contractSummary.validationCommands.join(' ');
  return {
    taskId: contract.taskId,
    allowedFileCount: allowed.length,
    newSourceFileCount: 0,
    newTestFileCount: 0,
    validationCommandCount: contractSummary.validationCommands.length,
    hasVitest: /\bnpm\s+run\s+vitest\b|\bnpx\s+vitest\b/.test(validationCmds),
    hasTypecheck: /\btypecheck\b/.test(validationCmds),
    hasLint: /\blint\b/.test(validationCmds),
    modifiesTests: allowed.some(f => /\.test\./.test(f) || /\.spec\./.test(f)),
    requiresReadableAndJsonOutput: false,
    requiresAsyncProcessTimeoutTests: false,
    hasCliRegistration: allowed.some(f => /cli[-.]?[jt]s$/.test(f)),
    changesPublicContract: allowed.some(f => /\/types\//.test(f) || /index\.[jt]s$/.test(f)),
    changesRuntimeBehavior: allowed.length > 2,
    changesPersistence: false,
    changesSecurityOrSandbox: false,
    mustReuseForbiddenFileLogic: contractSummary.forbiddenFiles.length > 0,
    hasStopIfBroadRefactorNote: /\bbroad\s*refactor\b/i.test(contract.notes?.join(' ') ?? ''),
    isDocsOnly: allowed.length > 0 && allowed.every(f => /\.md$/i.test(f)),
    isContractOnly: allowed.length > 0 && allowed.every(f => /\/types\//.test(f) || /contract/i.test(f)),
    isSinglePureFunction: allowed.length === 1,
    noRuntimeBehaviorChange: false,
  };
}

export interface RuntimeResolvedConfig {
  cliTimeoutMs: number;
  exitFlushGraceMs: number;
  idleTimeoutMs: number;
  progressIntervalMs: number;
  noCloseTimeoutMs: number;
  extensionMs: number;
  maxExtensions: number;
  maxWallClockMs: number;
}

const HARDCODED_DEFAULTS = {
  AGENT_CLI_TIMEOUT: 600000,
  AGENT_EXIT_FLUSH_GRACE_MS: 1500,
  AGENT_IDLE_TIMEOUT_MS: 120000,
  AGENT_PROGRESS_INTERVAL_MS: 30000,
  AGENT_NO_CLOSE_TIMEOUT_MS: 180000,
  AGENT_NO_CLOSE_EXTENSION_MS: 120000,
  AGENT_NO_CLOSE_MAX_EXTENSIONS: 3,
  AGENT_MAX_WALL_CLOCK_MS: 900000,
} as const;

/**
 * 构建运行时解析的配置
 * @param estimate - 任务运行时估算
 * @param getEnvNumber - 获取环境变量数值的函数
 * @returns 运行时解析的配置
 */
export function buildRuntimeResolvedConfig(
  estimate: TaskRuntimeEstimate | undefined,
  getEnvNumber: (name: string, defaultValue?: number) => number | undefined,
): RuntimeResolvedConfig {
  const resolve = (envName: keyof typeof HARDCODED_DEFAULTS, estimateValue?: number): number => {
    const envValue = getEnvNumber(envName);
    if (envValue !== undefined) return envValue;
    if (estimateValue !== undefined) return estimateValue;
    return HARDCODED_DEFAULTS[envName];
  };

  return {
    cliTimeoutMs: resolve('AGENT_CLI_TIMEOUT'),
    exitFlushGraceMs: resolve('AGENT_EXIT_FLUSH_GRACE_MS'),
    idleTimeoutMs: resolve('AGENT_IDLE_TIMEOUT_MS'),
    progressIntervalMs: resolve('AGENT_PROGRESS_INTERVAL_MS', estimate?.progressIntervalMs),
    noCloseTimeoutMs: resolve('AGENT_NO_CLOSE_TIMEOUT_MS', estimate?.noCloseTimeoutMs),
    extensionMs: resolve('AGENT_NO_CLOSE_EXTENSION_MS', estimate?.extensionMs),
    maxExtensions: resolve('AGENT_NO_CLOSE_MAX_EXTENSIONS', estimate?.maxExtensions),
    maxWallClockMs: resolve('AGENT_MAX_WALL_CLOCK_MS', estimate?.maxWallClockMs),
  };
}

/**
 * 格式化预检估算摘要
 * @param estimate - 任务运行时估算
 * @returns 格式化后的摘要行数组
 */
export function formatPreflightEstimateSummary(estimate: TaskRuntimeEstimate): string[] {
  const minutes = Math.floor(estimate.expectedDurationMs / 60_000);
  const seconds = Math.round((estimate.expectedDurationMs % 60_000) / 1000);
  const durationText = minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`;
  
  const lines = [
    `运行时预估：复杂度 ${estimate.complexity}，${durationText}`,
  ];
  
  if (estimate.historicalEstimateMs !== undefined) {
    const histMinutes = Math.floor(estimate.historicalEstimateMs / 60_000);
    const histSeconds = Math.round((estimate.historicalEstimateMs % 60_000) / 1000);
    const histDurationText = histMinutes > 0 ? `${histMinutes}m ${histSeconds}s` : `${histSeconds}s`;
    const histPercent = Math.round(estimate.weights.historical * 100);
    const heuristicPercent = Math.round(estimate.weights.heuristic * 100);
    lines.push(`历史校准：历史中位数 ${histDurationText}，权重 ${histPercent}%，启发式权重 ${heuristicPercent}%`);
  } else if (estimate.weights.historical === 0) {
    lines.push('历史校准：暂无历史数据，使用启发式估计');
  }
  
  if (estimate.splitRecommended) {
    lines.push('提示：任务规模较大，建议拆分后执行');
  }
  return lines;
}




/**
 * 运行任务
 * @param options - 任务选项
 * @param options.tool - 工具名称（可选）
 * @param options.taskId - 任务 ID
 * @param options.taskLabel - 任务标签（可选）
 * @param options.doc - 文档路径（可选）
 * @param options.dryRun - 是否为干运行模式（可选）
 * @param options.contractPreview - 是否为合同预览模式（可选）
 * @param options.deferTraceCloseout - 是否延迟跟踪关闭（可选）
 * @returns 运行任务结果
 */
export async function runTask(options: {
  tool?: string;
  taskId: string;
  taskLabel?: string;
  doc?: string;
  dryRun?: boolean;
  contractPreview?: boolean;
  deferTraceCloseout?: boolean;
}): Promise<RunTaskResult> {
  const { taskId, taskLabel, doc, dryRun, contractPreview } = options;
  const resolvedTaskLabel = taskLabel || taskId;
  const tool = options.tool || '';
  const deferTraceCloseout = options.deferTraceCloseout === true;
  await pruneExpiredRunTaskLogs();
  const baseAttributes = { taskId, tool, dryRun: Boolean(dryRun), contractPreview: Boolean(contractPreview) };
  const incomingContext = getTraceContextFromEnv();
  const knownAgentDescriptor = tool ? getAgentDescriptorById(tool) : null;
  const precomputedGlobalConfigDigest = tool ? `acp=${tool}` : undefined;
  const rootSpan = startSpan('cli.run-task', {
    context: incomingContext || undefined,
    source: 'cli',
    attributes: baseAttributes,
  });
  const traceContext = { traceId: rootSpan.traceId, source: 'cli' as const };

  const execute = async (): Promise<RunTaskResult> => {
    const docPath = doc ? getContext().environment.resolvePath(doc) : '(未指定文档)';
    const label = taskLabel || `任务 ${taskId}`;
    const contractSpan = startSpan('cli.run-task.buildAgentTaskContract', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: baseAttributes,
    });
    let agentTaskContract: AgentTaskContract & { summary: AgentTaskContractSummary };
    try {
      agentTaskContract = await buildAgentTaskContract({
        taskId,
        label,
        docPath: doc ? docPath : undefined,
        projectRoot: getContext().environment.getCwd(),
        tool: tool || undefined,
        globalConfigDigest: precomputedGlobalConfigDigest,
      });
    } catch (error) {
      await contractSpan.fail(error);
      throw error;
    }
    const agentTaskContractSummary = agentTaskContract.summary;
    await contractSpan.end({
      contractBoundaryConfidence: agentTaskContractSummary.boundaryConfidence,
      contractAllowedFileCount: agentTaskContractSummary.allowedFiles.length,
      contractForbiddenFileCount: agentTaskContractSummary.forbiddenFiles.length,
      contractValidationCommandCount: agentTaskContractSummary.validationCommands.length,
      contractExcerptStrategy: agentTaskContractSummary.excerptStrategy,
      contractExcerptTruncated: agentTaskContractSummary.docExcerptTruncated,
    });

    if (contractPreview) {
      const previewCommandGenerationPath = tool ? 'acp' : undefined;
      return {
        success: true,
        output: '',
        command: '',
        commandGenerationPath: previewCommandGenerationPath,
        fallbackUsed: false,
        agentTaskContract: agentTaskContractSummary,
      };
    }

    if (!tool) {
      throw new Error('缺少 Agent CLI 工具名称，请传入 --tool <name>');
    }

    // Runtime estimate preflight summary (for both regular and dry-run)
    const runtimeFeatures = buildTaskRuntimeFeatures(agentTaskContract, agentTaskContractSummary);
    const workspaceHash = djb2Hash(getContext().environment.getCwd());
    const profileKey = {
      agentId: tool,
      adapterId: knownAgentDescriptor ? `adapter=${knownAgentDescriptor.id}` : undefined,
      model: undefined,
      workspaceHash,
    };
    const sampleStore = createRuntimeSampleStore({
      resolvePath: (...segments: string[]) => getContext().environment.getPath('runtime-samples', ...segments),
    });
    const history = await sampleStore.load(profileKey);
    const runtimeEstimate = combineRuntimeEstimates({
      profileKey,
      taskShapeHash: agentTaskContract.instructionHash,
      features: runtimeFeatures,
      history,
    });
    for (const line of formatPreflightEstimateSummary(runtimeEstimate)) {
      getLogger().info(line);
    }

    if (dryRun) {
      const dryRunPrompt = buildDryRunPrompt(taskId, label, agentTaskContractSummary);
      getLogger().info(`[dry-run] ACP agent: ${tool} (${agentTaskContractSummary.allowedFiles.length} 个允许文件，${agentTaskContractSummary.forbiddenFiles.length} 个禁止文件)`);
      return {
        success: true,
        output: [
          'dry-run 预览',
          '',
          `ACP Agent: ${tool}`,
          `Prompt: ${dryRunPrompt.slice(0, 200)}...`,
          '',
          '完整命令已保存在结构化结果中；如需机器读取，请使用 --json。',
        ].join('\n'),
        command: '',
        commandGenerationPath: 'acp',
        fallbackUsed: false,
        agentTaskContract: agentTaskContractSummary,
      };
    }

    // === ACP Transport Execution Path ===
    // Replaces: adapter.render() + LLM command generation + bootstrapAgentRuntime
    //           + preflight checks + spawn block (~300 lines) + heuristic functions
    // See docs/01-acp-transport.md § run-task.ts 集成点

    const commandGenerationPath = 'acp';
    const taskPrompt = buildDefaultPrompt(taskId, label, docPath, agentTaskContract);
    const globalConfigDigest = `acp=${tool}`;
    agentTaskContractSummary.globalConfigDigest = globalConfigDigest;
    agentTaskContract.instructionHash = computeInstructionHash(
      taskId,
      label,
      agentTaskContract.docExcerpt || '',
      tool,
      agentTaskContract.allowedFiles,
      agentTaskContract.forbiddenFiles,
      globalConfigDigest,
    );
    agentTaskContractSummary.instructionHash = agentTaskContract.instructionHash;

    // Security preflight: assess task prompt (not CLI command)
    const guard = getSecurityGuard();
    const securityContext: SecurityContext = {
      cwd: getContext().environment.getCwd(),
      sessionId: traceContext.traceId,
      taskId: taskId,
      isDryRun: Boolean(dryRun),
    };
    const commandIntention: CommandIntention = {
      rawCommand: taskPrompt,
      tool: tool,
    };
    const securitySpan = startSpan('cli.run-task.securityCheck', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: { ...baseAttributes, commandGenerationPath },
    });
    const decision = await guard.assess(commandIntention, securityContext);
    await securitySpan.end({
      dangerous: decision.decision !== 'PASSED',
      severity: decision.riskLevel,
      ruleName: decision.ruleName || '',
    });
    if (decision.decision === 'BLOCKED') {
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `任务被安全策略拦截: ${decision.reason || decision.ruleName || '未授权操作'}`,
        command: '',
        commandGenerationPath,
        error: { code: 'SECURITY_BLOCKED', message: decision.reason || 'Blocked by security policy' },
        agentTaskContract: agentTaskContractSummary,
        riskAssessment: {
          level: decision.riskLevel,
          ruleName: decision.ruleName,
          needsConfirmation: false,
          enforcement: 'blocked',
        },
      };
    }

    // Validation command preflight risk check
    const validationRisk = await detectValidationPreflightRisk(
      agentTaskContractSummary.validationCommands,
      { cwd: getContext().environment.getCwd(), sessionId: traceContext.traceId } as SecurityContext,
    );
    if (validationRisk && validationRisk.enforcement === 'blocked') {
      return {
        success: false,
        output: `验证命令高风险: ${validationRisk.ruleName || validationRisk.blockedCommand || 'unknown'}`,
        command: '',
        commandGenerationPath,
        error: { code: 'SECURITY_BLOCKED', message: `验证命令高风险需确认: ${validationRisk.ruleName || validationRisk.blockedCommand || 'unknown'}` },
        agentTaskContract: agentTaskContractSummary,
      };
    }

    getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'EXECUTING', 'run-task');

    // Resolve timeout config
    const runtimeConfig = buildRuntimeResolvedConfig(
      runtimeEstimate,
      (name, defaultValue) => getContext().environment.getEnvNumber(name, defaultValue),
    );
    const gitDiffBefore = await readGitDiffSnapshot();
    const taskStartTime = Date.now();

    try {
      // === ACP transport.execute() ===
      const transportSpan = startSpan('cli.run-task.transport.execute', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          commandGenerationPath,
          timeoutMs: runtimeConfig.cliTimeoutMs,
        },
      });

      const acpConfig: AcpConfig = {
        agentId: tool,
        command: knownAgentDescriptor?.entryCommand ?? tool,
        args: knownAgentDescriptor?.subcommand
          ? [knownAgentDescriptor.subcommand, 'acp']
          : ['acp'],
        defaultTimeoutMs: runtimeConfig.cliTimeoutMs,
        permissionMode: 'ask',
      };
      const transport = createTransport(acpConfig, getContext().environment);

      const acpResult = await executeViaAcpTransport({
        transport,
        descriptor: knownAgentDescriptor ?? {
          id: tool, displayName: tool, entryCommand: tool,
          promptTransport: 'arg' as const, nonInteractiveFlags: [],
          approvalPolicySupport: 'none' as const, structuredOutputSupport: false,
          preflightSpec: { versionArgs: [] }, dryRunRenderMode: 'prompt-only' as const,
        },
        workspaceRoot: getContext().environment.getCwd(),
        taskPrompt,
        mode: 'run',
        traceContext,
        parentSpanId: rootSpan.spanId,
        securityContext,
        timeoutMs: runtimeConfig.cliTimeoutMs,
      });

      await transportSpan.end({
        success: acpResult.success,
        stopReason: acpResult.stopReason,
        toolCallCount: acpResult.toolCalls.length,
      });

      // === Post-execution: git changes + boundary check ===
      const collectSpan = startSpan('cli.run-task.collectGitChanges', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: baseAttributes,
      });
      const gitChanges = await collectGitChanges(gitDiffBefore) ?? undefined;
      await collectSpan.end({ changedFileCount: gitChanges?.changedFiles.length || 0 });

      // Post-execution boundary check (deterministic, no LLM)
      const postExecutionConfirmation = detectPostExecutionConfirmation({
        gitChanges,
        allowedFiles: agentTaskContractSummary.allowedFiles,
        forbiddenFiles: agentTaskContractSummary.forbiddenFiles,
        relatedFiles: agentTaskContractSummary.relatedFiles,
      });

      if (postExecutionConfirmation && postExecutionConfirmation.level === 'forbidden') {
        await persistRunTaskFailureLogs(taskId, { stdout: acpResult.output, stderr: '' });
        getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
        getLogger().warn(`检测到执行后确认: ${postExecutionConfirmation.reason} (${postExecutionConfirmation.matchedFiles.join(', ')})`);
        const failureKind = 'agent' as DocTaskFailureKind;
        const unclosedExecution = isUnclosedExecutionFailure({ success: false, gitChanges, verification: undefined });
        const recoveryDecision = buildRecoveryDecisionSummary({ failureKind, gitChanges, verification: undefined, agentTaskContract: agentTaskContractSummary });
        const reviewReport = buildRunTaskReviewReport({ taskId, taskLabel: resolvedTaskLabel, contract: agentTaskContractSummary, gitChanges, verification: undefined, agentExecutionOutcome: 'implemented', alreadySatisfied: false });
        return {
          success: false,
          output: acpResult.output,
          command: '',
          commandGenerationPath,
          agentExecutionOutcome: 'implemented',
          riskAssessment: { level: 'high', ruleName: postExecutionConfirmation.reason, needsConfirmation: true, enforcement: 'confirm_required', confirmationSource: 'post-execution', blockedCommand: postExecutionConfirmation.matchedFiles.join(', ') },
          error: { code: 'NEEDS_CONFIRMATION', message: `检测到执行后确认: ${postExecutionConfirmation.reason}` },
          gitChanges,
          agentTaskContract: agentTaskContractSummary,
          usage: acpResult.usage,
          failureKind,
          unclosedExecution,
          recoveryDecision,
          reviewReport,
        };
      }

      let postExecutionWarning: RunTaskResult['warning'];
      if (postExecutionConfirmation && (postExecutionConfirmation.level === 'related' || postExecutionConfirmation.level === 'out_of_scope')) {
        postExecutionWarning = {
          level: postExecutionConfirmation.level,
          reason: postExecutionConfirmation.reason,
          matchedFiles: postExecutionConfirmation.matchedFiles,
        };
        getLogger().warn(`检测到边界警告: ${postExecutionConfirmation.reason} (${postExecutionConfirmation.matchedFiles.join(', ')})`);
      }

      // === Verification ===
      let verification: VerificationResult | undefined;
      const validationCommands = agentTaskContractSummary.validationCommands;
      if (validationCommands.length > 0 && acpResult.agentExecutionOutcome !== 'planned_only') {
        const verificationSpan = startSpan('cli.run-task.verification', {
          context: traceContext,
          parentSpanId: rootSpan.spanId,
          source: 'cli',
          attributes: { ...baseAttributes, verificationCommandCount: validationCommands.length },
        });
        try {
          verification = await runVerificationCommands(validationCommands, getContext().environment.getCwd());
          await verificationSpan.end({
            verificationOk: verification.ok,
            verificationIsSystemError: !!verification.isSystemError,
            verificationTotalCommands: verification.commands.length,
          });
          getLogger().info(`验证完成: ${verification.ok ? '通过' : '失败'} (${verification.commands.length} 条命令)`);
        } catch (error) {
          verification = { ok: false, commands: [], isSystemError: true };
          await verificationSpan.fail(error);
          getLogger().error('验证执行异常');
        }
      }

      const finalSuccess = acpResult.success
        && (verification ? (verification.ok && !verification.isSystemError) : true);
      const unclosedExecution = isUnclosedExecutionFailure({ success: finalSuccess, gitChanges, verification });
      const reviewReport = buildRunTaskReviewReport({
        taskId,
        taskLabel: resolvedTaskLabel,
        contract: agentTaskContractSummary,
        gitChanges,
        verification,
        agentExecutionOutcome: acpResult.agentExecutionOutcome,
        alreadySatisfied: false,
      });

      if (acpResult.usage) {
        getLogger().info(`Token 消耗 (ACP): completion=${acpResult.usage.completionTokens}, total=${acpResult.usage.totalTokens}`);
      }

      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
      getLogger().info(finalSuccess ? '任务执行成功' : '任务执行完成（验证失败或系统错误）');
      if (gitChanges) {
        getLogger().info(`变更文件: ${gitChanges.changedFiles.length} 个`);
      }
      if (!finalSuccess) {
        await persistRunTaskFailureLogs(taskId, { stdout: acpResult.output, stderr: '' });
      }

      // Record runtime sample
      const actualDurationMs = Date.now() - taskStartTime;
      const sample = createRuntimeSample(
        profileKey,
        agentTaskContract.instructionHash,
        runtimeEstimate.complexity,
        runtimeEstimate.score,
        actualDurationMs,
        finalSuccess,
        { failureKind: acpResult.failureKind, completionSignal: acpResult.stopReason },
      );
      await sampleStore.append(sample);

      return {
        success: finalSuccess,
        output: acpResult.output,
        command: '',
        commandGenerationPath,
        agentExecutionOutcome: acpResult.agentExecutionOutcome,
        error: acpResult.error,
        gitChanges,
        agentTaskContract: agentTaskContractSummary,
        verification,
        usage: acpResult.usage,
        failureKind: acpResult.failureKind,
        unclosedExecution,
        reviewReport,
        warning: postExecutionWarning,
        recoveryDecision: !finalSuccess
          ? buildRecoveryDecisionSummary({ failureKind: acpResult.failureKind, gitChanges, verification, agentTaskContract: agentTaskContractSummary })
          : undefined,
      };
    } catch (error) {
      const execError = error as Error;
      await persistRunTaskFailureLogs(taskId, { stdout: '', stderr: execError.message || String(error) });
      const spawnFailSpan = startSpan('cli.run-task.transport.execute', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: { ...baseAttributes, commandGenerationPath, timeoutMs: runtimeConfig.cliTimeoutMs },
      });
      const gitChanges = await collectGitChanges(gitDiffBefore) ?? undefined;
      const unclosedExecution = isUnclosedExecutionFailure({ success: false, gitChanges, verification: undefined });
      await spawnFailSpan.fail(error, { unclosedExecution });
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'FAILED', 'run-task');
      getLogger().error(`任务执行失败: ${execError.message || String(error)}`);

      const failureKind: DocTaskFailureKind = 'agent';
      const recoveryDecision = buildRecoveryDecisionSummary({ failureKind, gitChanges, verification: undefined, agentTaskContract: agentTaskContractSummary });
      const reviewReport = buildRunTaskReviewReport({ taskId, taskLabel: resolvedTaskLabel, contract: agentTaskContractSummary, gitChanges, verification: undefined, agentExecutionOutcome: unclosedExecution ? 'implemented' : undefined, alreadySatisfied: false });

      const actualDurationMs = Date.now() - taskStartTime;
      const sample = createRuntimeSample(profileKey, agentTaskContract.instructionHash, runtimeEstimate.complexity, runtimeEstimate.score, actualDurationMs, false, { failureKind, completionSignal: undefined });
      await sampleStore.append(sample);

      return {
        success: false,
        output: execError.message || 'Agent 执行失败',
        command: '',
        commandGenerationPath,
        error: { code: 'AGENT_FAILED', message: execError.message || 'Agent 执行失败' },
        gitChanges,
        agentTaskContract: agentTaskContractSummary,
        failureKind,
        unclosedExecution,
        recoveryDecision,
        reviewReport,
      };
    }
  };

  try {
    const result = await execute();
    if (deferTraceCloseout) {
      return attachRunTaskTraceCloseout(result, {
        rootSpan,
        traceContext,
        baseAttributes,
      });
    }
    await rootSpan.end();
    return result;
  } catch (error) {
    if (deferTraceCloseout) {
      const tracedError = typeof error === 'object' && error !== null
        ? error
        : new Error(String(error));
      throw attachRunTaskTraceCloseout(tracedError, {
        rootSpan,
        traceContext,
        baseAttributes,
      });
    }
    await rootSpan.fail(error);
    throw error;
  }
}

/**
 * 从任务合同文件派生 taskId。
 * 优先解析文件正文中的 `taskId: <id>`；若文件不存在或正文不含此字段，
 * 则回退到文件名（约定形如 `nlreq_*.md`）。
 *
 * 该函数是建议文案 `vectahub run-task --file <path>` 真正可用
 * （不再强依赖用户手动复制 taskId）的关键。
 */
export function deriveTaskIdFromDocFile(filePath: string, context: InfrastructureContext = getContext()): string | null {
  if (!filePath) return null;
  const fileName = filePath.split(/[\\/]/).pop() ?? '';
  const fileNameMatch = fileName.match(/^(nlreq_[A-Za-z0-9_-]+)\.md$/);
  const fileNameCandidate = fileNameMatch ? fileNameMatch[1] : (fileName.replace(/\.md$/i, '') || null);

  if (!context.environment.exists(filePath)) {
    return fileNameCandidate;
  }
  try {
    const content = context.environment.readFile(filePath);
    const bodyMatch = content.match(/^\s*taskId\s*:\s*(\S+)\s*$/m);
    if (bodyMatch && bodyMatch[1]) {
      return bodyMatch[1];
    }
  } catch {
    // 读取失败时回退到文件名
  }
  return fileNameCandidate;
}

export function createRunTaskCmd(_context: InfrastructureContext): Command {
  bindRunTaskContext(_context);
  const output = createRunTaskCommandOutput();
  return new Command('run-task')
    .description('执行文档任务：根据任务描述和 Agent CLI 工具生成并执行命令')
    .option('--tool <name>', 'Agent CLI 工具名称（如 aider、claude）')
    .option('--task-id <id>', '任务编号（与 --file/--doc 互斥：传 file 时可省略）')
    .option('--file <path>', '任务合同文档路径（可派生 --task-id）')
    .option('--task-label <label>', '任务描述')
    .option('--doc <path>', '参考文档路径（与 --file 等价的旧别名）')
    .option('--dry-run', '仅生成命令，不实际执行')
    .option('--contract-preview', '只生成任务边界合同摘要，不加载 LLM、不执行 Agent')
    .option('--json', '以 JSON 格式输出')
    .action(async (options: {
      tool?: string;
      taskId?: string;
      taskLabel?: string;
      doc?: string;
      file?: string;
      dryRun?: boolean;
      contractPreview?: boolean;
      json?: boolean;
    }) => {
      let deferredTraceCloseout: RunTaskTraceCloseout | undefined;
      try {
        const docPath = options.doc || options.file;
        if (!docPath) {
          throw new VectaHubError('run-task 需要 --file 或 --doc 指定任务合同路径', ErrorType.RUNTIME, { code: 'MISSING_DOC_PATH' });
        }
        let resolvedTaskId = options.taskId;
        if (!resolvedTaskId) {
          const derived = deriveTaskIdFromDocFile(docPath, _context);
          if (!derived) {
            throw new VectaHubError('无法从 --file 派生 --task-id，请在文件名或文件正文中包含 taskId 字段', ErrorType.RUNTIME, { code: 'MISSING_TASK_ID' });
          }
          resolvedTaskId = derived;
        }
        const result = await runTask({
          ...options,
          taskId: resolvedTaskId,
          doc: docPath,
          deferTraceCloseout: Boolean(options.json),
        });
        deferredTraceCloseout = getRunTaskTraceCloseout(result);

        if (options.json) {
          const jsonOutput = formatRunTaskJson(result);
          if (!deferredTraceCloseout) {
            output.json(jsonOutput);
          } else {
            const traceCloseout = deferredTraceCloseout;
            const formatJsonSpan = startSpan('cli.run-task.formatJson', {
              context: traceCloseout.traceContext,
              parentSpanId: traceCloseout.rootSpan.spanId,
              source: 'cli',
              attributes: traceCloseout.baseAttributes,
            });
            try {
              const rendered = JSON.stringify(jsonOutput, null, 2);
              output.renderedJson(rendered);
              await formatJsonSpan.end({ outputLength: rendered.length });
              await traceCloseout.rootSpan.end();
              deferredTraceCloseout = undefined;
            } catch (error) {
              await formatJsonSpan.fail(error);
              await traceCloseout.rootSpan.fail(error);
              deferredTraceCloseout = undefined;
              throw error;
            }
          }
        } else if (!result.success) {
          output.log(formatRunTaskHumanOutput(result, {
            mode: options.contractPreview ? 'contract-preview' : options.dryRun ? 'dry-run' : 'default',
          }));
          throw new VectaHubError('Task execution failed', ErrorType.RUNTIME);
        } else {
          output.log(formatRunTaskHumanOutput(result, {
            mode: options.contractPreview ? 'contract-preview' : options.dryRun ? 'dry-run' : 'default',
          }));
        }
      } catch (error) {
        if (!deferredTraceCloseout && typeof error === 'object' && error !== null) {
          deferredTraceCloseout = getRunTaskTraceCloseout(error);
        }
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          const errorJson = { ok: false, error: { code: 'CLI_ERROR', message } };
          if (!deferredTraceCloseout) {
            output.json(errorJson);
          } else {
            const traceCloseout = deferredTraceCloseout;
            const formatJsonSpan = startSpan('cli.run-task.formatJson', {
              context: traceCloseout.traceContext,
              parentSpanId: traceCloseout.rootSpan.spanId,
              source: 'cli',
              attributes: traceCloseout.baseAttributes,
            });
            try {
              const rendered = JSON.stringify(errorJson, null, 2);
              output.renderedJson(rendered);
              await formatJsonSpan.end({ outputLength: rendered.length });
              await traceCloseout.rootSpan.fail(error);
            } catch (formatError) {
              await formatJsonSpan.fail(formatError);
              await traceCloseout.rootSpan.fail(formatError);
              throw formatError;
            }
          }
        } else {
          if (deferredTraceCloseout) {
            await deferredTraceCloseout.rootSpan.fail(error);
          }
          createBoundRunTaskLogger(_context).error(`执行失败: ${message}`);
        }
        throw error instanceof VectaHubError ? error : new VectaHubError(message, ErrorType.RUNTIME, error);
      }
    });
}

export function createRunTaskCleanLogsCmd(_context: InfrastructureContext): Command {
  bindRunTaskContext(_context);
  const output = createRunTaskCommandOutput();
  return new Command('run-task-clean-logs')
    .description('清理当前工作目录下的 run-task 失败日志')
    .option('--json', '以 JSON 格式输出')
    .action(async (options: { json?: boolean }) => {
      const cleanupResult = await cleanRunTaskLogs();
      if (options.json) {
        output.json({
          ok: true,
          removedFiles: cleanupResult.removedFiles,
        });
        return;
      }

      output.log(`Cleared ${cleanupResult.removedFiles} run-task failure log files.`);
    });
}

const boundRunTaskCmd: Command | null = null;
const boundRunTaskCleanLogsCmd: Command | null = null;

export function getRunTaskCmd(): Command {
  if (!boundRunTaskCmd) {
    throw new Error('RunTask command context is not bound. Use createRunTaskCmd(context) instead.');
  }
  return boundRunTaskCmd;
}

export function getRunTaskCleanLogsCmd(): Command {
  if (!boundRunTaskCleanLogsCmd) {
    throw new Error('RunTaskCleanLogs command context is not bound. Use createRunTaskCleanLogsCmd(context) instead.');
  }
  return boundRunTaskCleanLogsCmd;
}

/**
 * @deprecated Legacy static export. Kept for backwards compatibility.
 * Use createRunTaskCmd(context) through composition root instead.
 */
export const runTaskCmd = new Proxy({} as Command, {
  get(target, prop) {
    return Reflect.get(getRunTaskCmd(), prop);
  }
});

/**
 * @deprecated Legacy static export. Kept for backwards compatibility.
 * Use createRunTaskCleanLogsCmd(context) through composition root instead.
 */
export const runTaskCleanLogsCmd = new Proxy({} as Command, {
  get(target, prop) {
    return Reflect.get(getRunTaskCleanLogsCmd(), prop);
  }
});
