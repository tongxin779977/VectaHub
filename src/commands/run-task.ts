import { Command } from 'commander';
import { Transform, type TransformOptions } from 'node:stream';
import { getDefaultContext, type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { getSecurityGuard } from '../security-protocol/factory.js';
import type { SecurityContext, CommandIntention } from '../types/security.js';
import { createLLMConfig, createLLMConfigDigestSource, LLMClient } from '../nl/llm.js';
import { AGENT_CMD_GENERATOR_ID } from '../nl/prompt-manager.js';
import { getToolCacheManager } from '../cli-tools/discovery/cache-manager.js';
import { getSecurityManager } from '../security-protocol/manager.js';
import { assessCommandRisk } from '../security-protocol/engine.js';
import { createChildEnv, getTraceContextFromEnv, startSpan, withSpan, type SpanHandle } from '../infrastructure/trace/index.js';
import { deriveAgentTaskBoundary, deriveDocExcerpt, computeInstructionHash } from './agent-task-contract.js';
import { buildGlobalConfigDigest } from '@vectahub/doc-task-contract-core';
import type { AgentTaskContract } from '../types/doc-task.js';
import { splitPosixArgs } from '../utils/shell.js';
import { createRedactor } from '../security-protocol/redactor.js';
import { getVectaHubPath, djb2Hash } from '../infrastructure/paths/index.js';
import { getAgentAdapterById, getAgentDescriptorById } from './agent-cli-adapter.js';
import { bootstrapAgentRuntime } from './agent-runtime-bootstrap.js';
import { decideRecovery, type RecoveryDecision, type RecoveryDecisionKind, type RecoveryDecisionMode } from '../types/recovery.js';
import type { DocTaskFailureKind } from '../types/doc-task.js';

let boundContext: InfrastructureContext | null = null;

function getContext() {
  if (!boundContext) {
    throw new Error('run-task context is not bound. Use bindRunTaskContext(context) first.');
  }
  return boundContext;
}

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

const IDE_ENV_PATTERNS = [
  /^CODEX_(?!HOME$)/,
  /^TERM_PROGRAM$/,
  /^VSCODE_/,
  /^ELECTRON_/,
  /^ICUBE_/,
  /^__CFBundleIdentifier$/,
  /^SAFE_RM_/,
];

function stripIDEEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(getContext().environment.getAllEnv())) {
    if (!IDE_ENV_PATTERNS.some(p => p.test(key))) {
      env[key] = value;
    }
  }
  return env;
}

const DEFAULT_AGENT_CLI_TIMEOUT = 600000;
function getAgentCliTimeout(): number {
  return getContext().environment.getEnvNumber('AGENT_CLI_TIMEOUT', DEFAULT_AGENT_CLI_TIMEOUT) ?? DEFAULT_AGENT_CLI_TIMEOUT;
}
const DEFAULT_AGENT_EXIT_FLUSH_GRACE_MS = 1500;
function getAgentExitFlushGraceMs(): number {
  return getContext().environment.getEnvNumber('AGENT_EXIT_FLUSH_GRACE_MS', DEFAULT_AGENT_EXIT_FLUSH_GRACE_MS) ?? DEFAULT_AGENT_EXIT_FLUSH_GRACE_MS;
}
const DEFAULT_MAX_JSON_OUTPUT_LENGTH = 50000;
function getMaxJsonOutputLength(): number {
  return getContext().environment.getEnvNumber('RUN_TASK_MAX_JSON_OUTPUT_LENGTH', DEFAULT_MAX_JSON_OUTPUT_LENGTH) ?? DEFAULT_MAX_JSON_OUTPUT_LENGTH;
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
const RUN_TASK_FAILURE_LOG_RETENTION_DAYS = 7;
const redactor = createRedactor();

interface CommandExecutionError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  status?: number | null;
  code?: string | number | null;
  killed?: boolean;
  completionSignal?: SpawnCompletionSignal;
}

class RedactionTransform extends Transform {
  private carry = '';
  private onTokenUsage?: (usage: TokenUsage) => void;

  constructor(options?: TransformOptions, onTokenUsage?: (usage: TokenUsage) => void) {
    super(options);
    this.onTokenUsage = onTokenUsage;
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer | string) => void): void {
    try {
      const text = this.carry + chunk.toString();
      const splitAt = text.lastIndexOf('\n');
      if (splitAt < 0) {
        this.carry = text;
        callback();
        return;
      }
      const complete = text.slice(0, splitAt + 1);
      this.carry = text.slice(splitAt + 1);
      
      const redacted = redactor.redact(complete);
      
      // Real-time token capture on redacted lines
      if (this.onTokenUsage) {
        const usage = parseTokenUsage(redacted);
        if (usage) {
          this.onTokenUsage(usage);
        }
      }

      callback(null, redacted);
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: (error?: Error | null, data?: Buffer | string) => void): void {
    try {
      if (this.carry) {
        const redacted = redactor.redact(this.carry);
        if (this.onTokenUsage) {
          const usage = parseTokenUsage(redacted);
          if (usage) {
            this.onTokenUsage(usage);
          }
        }
        callback(null, redacted);
      } else {
        callback(null, '');
      }
    } catch (error) {
      callback(error as Error);
    }
  }
}

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
  commandGenerationPath?: 'adapter' | 'llm-fallback';
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
  commandGenerationPath?: 'adapter' | 'llm-fallback';
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
  error?: string | {
    code: string;
    message: string;
  };
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

type SpawnCompletionSignal = 'close' | 'exit-stream-drain' | 'exit-flush-grace' | 'timeout';

interface SpawnCompletionResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  completionSignal: SpawnCompletionSignal;
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

function waitForWriterSettled(writer: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const statefulWriter = writer as NodeJS.WritableStream & { writableFinished?: boolean; destroyed?: boolean };
    if (statefulWriter.writableFinished || statefulWriter.destroyed) {
      resolve();
      return;
    }

    let settled = false;
    const cleanup = () => {
      writer.removeListener('finish', onDone);
      writer.removeListener('close', onDone);
      writer.removeListener('error', onError);
    };
    const onDone = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error as Error);
    };

    writer.once('finish', onDone);
    writer.once('close', onDone);
    writer.once('error', onError);
  });
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

function buildAgentChildEnv(
  traceContext: { traceId: string; source: 'cli' },
  parentSpanId: string,
  envPatch?: Record<string, string>,
): NodeJS.ProcessEnv {
  return {
    ...stripIDEEnv(),
    ...createChildEnv(traceContext, parentSpanId),
    ...(envPatch || {}),
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
    VECTAHUB_NON_INTERACTIVE: '1',
  };
}

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
    if (!shortStat.trim()) return null;

    const { stdout: diffStat } = await getContext().environment.exec('git diff --stat');
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
    'yolo mode is enabled',
    'completion_tokens',
    'prompt_tokens',
    'messages":',
    '"role":',
    '"content":',
    '"session"',
    '"trace"',
    '"prompt"',
  ];
  if (hiddenFragments.some(fragment => lower.includes(fragment))) {
    return null;
  }

  if (/^(##+|\d+\.)\s/.test(trimmed)) {
    return null;
  }
  if (/^[-*]\s+(allow|forbid|validation|task|trace|session|prompt)\b/i.test(trimmed)) {
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
    const excerpt = await deriveDocExcerpt({
      docPath: input.docPath,
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
function parseTokenUsage(output: string): TokenUsage | undefined {
  try {
    // Try to find JSON with usage/token info in the output
    const jsonMatch = extractOutermostJson(output);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch);
      // Pattern 1: usage.prompt_tokens / usage.completion_tokens
      if (parsed.usage) {
        const u = parsed.usage;
        const prompt = u.prompt_tokens ?? u.promptTokens ?? u.input_tokens ?? 0;
        const completion = u.completion_tokens ?? u.completionTokens ?? u.output_tokens ?? 0;
        if (prompt > 0 || completion > 0) {
          return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
        }
      }
      // Pattern 2: top-level token fields
      if (parsed.prompt_tokens || parsed.promptTokens) {
        const prompt = parsed.prompt_tokens ?? parsed.promptTokens ?? 0;
        const completion = parsed.completion_tokens ?? parsed.completionTokens ?? 0;
        return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
      }
    }

    // Pattern 3: stderr lines like "Token usage: 1234 prompt, 567 completion"
    const tokenLine = output.match(/token[s]?\s*(?:usage|count)?:?\s*(\d+)\s*(?:prompt|input)[,\s]+(\d+)\s*(?:completion|output)/i);
    if (tokenLine) {
      const prompt = parseInt(tokenLine[1], 10);
      const completion = parseInt(tokenLine[2], 10);
      return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
    }
  } catch {
    // Ignore parse errors
  }
  return undefined;
}

function truncateVerificationSummary(value: string | undefined): string | undefined {
  if (!value || value.length <= VERIFICATION_SUMMARY_MAX_LENGTH) return value;
  const suffix = '...';
  return `${value.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH - suffix.length)}${suffix}`;
}

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
  return getVectaHubPath('outputs', 'run-task', djb2Hash(getContext().environment.getCwd()));
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

function getRunTaskFailureLogRetentionCutoff(now: number = Date.now()): number {
  return now - (RUN_TASK_FAILURE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

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

function detectAgentExecutionOutcome(output: string): 'implemented' | 'planned_only' {
  const text = output.toLowerCase();
  const plannedOnlySignals = [
    '暂不执行修改',
    '先给出实施计划',
    '先给出实现计划',
    '按 agents.md 要求，我先给出实施计划',
    '如果你确认这个方案',
    '下一条就给出逐文件精确补丁',
    'not executing changes yet',
    'i will first provide a plan',
  ];

  if (plannedOnlySignals.some(signal => text.includes(signal.toLowerCase()))) {
    return 'planned_only';
  }
  return 'implemented';
}

function isUnclosedExecutionFailure(input: {
  success: boolean;
  gitChanges?: GitChangeInfo;
  verification?: VerificationResult;
}): boolean {
  const changedFileCount = input.gitChanges?.changedFiles.length ?? 0;
  return !input.success && changedFileCount > 0 && input.verification === undefined;
}

function mapErrorCodeToFailureKind(
  errorCode: string | undefined,
  verification?: VerificationResult,
): DocTaskFailureKind | undefined {
  if (verification?.isSystemError) {
    return 'system_internal';
  }
  if (verification && !verification.ok) {
    return 'test';
  }

  switch (errorCode) {
    case 'TIMEOUT':
      return 'timeout';
    case 'AGENT_SYSTEM_ERROR':
      return 'system_internal';
    case 'AGENT_CONFIG_ERROR':
    case 'INVALID_INVOCATION':
      return 'config';
    case 'SECURITY_BLOCKED':
      return 'conflict';
    case 'INVALID_JSON':
      return 'json_protocol';
    case 'CANCELLED':
      return 'cancelled';
    case 'AGENT_PLANNED_ONLY':
      return undefined;
    case 'NEEDS_CONFIRMATION':
      return undefined;
    case 'AGENT_FAILED':
      return 'agent';
    default:
      return errorCode ? 'unknown' : undefined;
  }
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

function inferExecutionFailureKind(input: {
  agentExecutionOutcome?: 'implemented' | 'planned_only';
  softSystemFailureMessage?: string | null;
  verification?: VerificationResult;
}): DocTaskFailureKind | undefined {
  if (input.agentExecutionOutcome === 'planned_only') {
    return undefined;
  }
  if (input.softSystemFailureMessage) {
    return 'system_internal';
  }
  if (input.verification?.isSystemError) {
    return 'system_internal';
  }
  if (input.verification && !input.verification.ok) {
    return 'test';
  }
  return undefined;
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
}): { reason: string; matchedFiles: string[] } | null {
  const changedFiles = input.gitChanges?.changedFiles ?? [];
  if (!changedFiles.length) {
    return null;
  }

  const normalizedChanged = changedFiles.map(normalizeContractPath);
  const allowed = new Set(input.allowedFiles.map(normalizeContractPath).filter(Boolean));
  const forbidden = new Set(input.forbiddenFiles.map(normalizeContractPath).filter(Boolean));
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
      reason: 'forbidden_files_modified',
      matchedFiles: forbiddenMatches,
    };
  }

  if (allowed.size > 0) {
    const outOfScope = normalizedChanged.filter(file => !allowed.has(file));
    if (outOfScope.length > 0) {
      return {
        reason: 'out_of_scope_changes',
        matchedFiles: outOfScope,
      };
    }
  }

  return null;
}

function detectAgentSoftSystemFailure(output: string, gitChanges?: GitChangeInfo): string | null {
  if (gitChanges?.changedFiles.length) {
    return null;
  }

  const text = output.toLowerCase();
  const directFailureSignals = [
    '受当前环境限制，任务未能执行代码修改',
    '受当前环境限制',
    '未能执行代码修改',
    '无法执行代码修改',
    '无法落盘修改',
    '未做代码改动',
    '无法修改文件',
    '实际修改文件：无',
    '本次实际修改文件：无',
    '本地命令工具无法启动',
    '本地命令/文件访问工具不可用',
    '文件访问工具不可用',
    '当前被环境阻塞',
    '当前被执行环境阻塞',
    '任务未落地，当前被执行环境阻塞',
    '当前任务被工具层阻断',
    '工具层阻断',
    '本地命令入口不可用',
    'unable to execute code changes',
    'unable to make code changes',
    'could not execute code changes',
  ];
  const environmentSignals = [
    '本地命令工具无法启动',
    '本地命令/文件访问工具不可用',
    '文件访问工具不可用',
    '当前被环境阻塞',
    '当前被执行环境阻塞',
    '任务未落地，当前被执行环境阻塞',
    '当前任务被工具层阻断',
    '工具层阻断',
    '本地命令入口不可用',
    'sandbox-exec: sandbox_apply',
    'sandbox_apply: operation not permitted',
    'sandbox: read-only',
    'operation not permitted',
    'read-only',
    'read only',
  ];
  const noChangeSignals = [
    '未执行代码修改',
    '未能执行代码修改',
    '无法执行代码修改',
    '无法落盘修改',
    '无法修改代码',
    '未做代码改动',
    '未做代码修改',
    '未改代码',
    '无法修改文件',
    '实际修改文件：无',
    '本次实际修改文件：无',
    '任务未落地',
    'unable to execute code changes',
    'unable to make code changes',
    'could not execute code changes',
  ];
  const readBlockedSignals = [
    '无法进入工作区',
    '无法打开仓库文件',
    '无法读取仓库代码',
    '无法读取代码',
    '无法读取现有代码',
    '无法读取仓库与文档',
    '无法读取',
  ];
  const verificationSkippedSignals = [
    '未执行验证',
    '验证未执行',
  ];

  const hasEnvironmentBlock = environmentSignals.some(signal => text.includes(signal.toLowerCase()));
  const hasNoChangeSignal = noChangeSignals.some(signal => text.includes(signal.toLowerCase()));
  const hasReadBlockedSignal = readBlockedSignals.some(signal => text.includes(signal.toLowerCase()));
  const hasVerificationSkippedSignal = verificationSkippedSignals.some(signal => text.includes(signal.toLowerCase()));

  const matched = directFailureSignals.some(signal => text.includes(signal.toLowerCase()))
    || (hasEnvironmentBlock && (hasNoChangeSignal || hasReadBlockedSignal || hasVerificationSkippedSignal));

  return matched ? 'Agent 输出表明当前环境限制阻止了代码修改' : null;
}

function classifyAgentFailureCode(error: unknown, output: string): 'TIMEOUT' | 'AGENT_SYSTEM_ERROR' | 'AGENT_CONFIG_ERROR' | 'AGENT_FAILED' {
  const execError = error as { code?: string | number; message?: string };
  const text = `${execError?.message || ''}\n${output}`.toLowerCase();

  if (execError?.code === 'TIMEOUT' || text.includes('timeout') || text.includes('timed out') || text.includes('超时')) {
    return 'TIMEOUT';
  }

  if ([
    'io error',
    'operation not permitted',
    'stream disconnected before completion',
    'failed to connect to websocket',
    'readonly database',
    'read only database',
    'attempt to write a readonly database',
    'eperm',
    'emfile',
    'enfile',
  ].some(keyword => text.includes(keyword))) {
    return 'AGENT_SYSTEM_ERROR';
  }

  if ([
    'permission denied',
    'no such file',
    'path does not exist',
    'enoent',
    'eacces',
    'not found',
    '未安装',
    '未配置',
  ].some(keyword => text.includes(keyword))) {
    return 'AGENT_CONFIG_ERROR';
  }

  return 'AGENT_FAILED';
}

function validateGeneratedInvocation(tool: string, generated: GeneratedCommand): { valid: true } | { valid: false; message: string } {
  if (!generated.command || typeof generated.command !== 'string' || !generated.command.trim()) {
    return { valid: false, message: 'invocation validator: command 不能为空' };
  }
  if (generated.command !== tool) {
    return { valid: false, message: `invocation validator: command 必须与 tool 一致 (tool=${tool}, command=${generated.command})` };
  }
  if (!Array.isArray(generated.args) || generated.args.some(arg => typeof arg !== 'string')) {
    return { valid: false, message: 'invocation validator: args 必须是 string[]' };
  }
  if (generated.args.some(arg => arg.length === 0)) {
    return { valid: false, message: 'invocation validator: args 不允许空字符串' };
  }
  return { valid: true };
}

export async function runVerificationCommands(
  validationCommands: string[],
  cwd: string,
): Promise<VerificationResult> {
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
      getLogger().warn(`验证命令被安全策略阻断 (critical): ${cmd} — ${decision.reason || ''}`);
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }

    if (decision.decision === 'REQUIRES_CONFIRMATION') {
      // 在自动验证流程中，如果不具备交互能力，高风险命令视为阻断
      getLogger().warn(`验证命令需要人工确认，在自动流程中已被跳过: ${cmd}`);
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }

    const startMs = Date.now();
    try {
      const { stdout, stderr } = await getContext().environment.exec(cmd, {
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
      const execError = error as CommandExecutionError;
      
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
  if (result.commandGenerationPath) {
    jsonResult.commandGenerationPath = result.commandGenerationPath;
  }
  if (result.fallbackUsed !== undefined) {
    jsonResult.fallbackUsed = result.fallbackUsed;
  }
  if (result.agentExecutionOutcome) {
    jsonResult.agentExecutionOutcome = result.agentExecutionOutcome;
  }
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
  if (result.verification) {
    jsonResult.verification = result.verification;
  }
  if (result.riskAssessment) {
    jsonResult.riskAssessment = result.riskAssessment;
  }
  if (result.usage) {
    jsonResult.usage = result.usage;
  }
  if (result.failureKind) {
    jsonResult.failureKind = result.failureKind;
  }
  if (result.unclosedExecution !== undefined) {
    jsonResult.unclosedExecution = result.unclosedExecution;
  }
  if (result.completionSignal) {
    jsonResult.completionSignal = result.completionSignal;
  }
  if (result.recoveryDecision) {
    jsonResult.recoveryDecision = result.recoveryDecision;
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
  deferTraceCloseout?: boolean;
}): Promise<RunTaskResult> {
  const { taskId, taskLabel, doc, dryRun, contractPreview } = options;
  const tool = options.tool || '';
  const deferTraceCloseout = options.deferTraceCloseout === true;
  await pruneExpiredRunTaskLogs();
  const baseAttributes = { taskId, tool, dryRun: Boolean(dryRun), contractPreview: Boolean(contractPreview) };
  const incomingContext = getTraceContextFromEnv();
  const knownAgentDescriptor = tool ? getAgentDescriptorById(tool) : null;
  const knownAgentAdapter = tool ? getAgentAdapterById(tool) : null;
  const llmConfigDigestSource = tool && (!knownAgentDescriptor || !knownAgentAdapter)
    ? createLLMConfigDigestSource()
    : null;
  const precomputedGlobalConfigDigest = knownAgentDescriptor && knownAgentAdapter
    ? `adapter=${knownAgentDescriptor.id}`
    : llmConfigDigestSource
      ? buildGlobalConfigDigest(llmConfigDigestSource)
    : undefined;
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
      const previewCommandGenerationPath = tool
        ? knownAgentDescriptor && knownAgentAdapter
          ? 'adapter'
          : 'llm-fallback'
        : undefined;
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

    if (dryRun) {
      const dryRunPrompt = buildDryRunPrompt(taskId, label, agentTaskContractSummary);
      const dryRunGenerated = knownAgentDescriptor && knownAgentAdapter
        ? knownAgentAdapter.render({
          descriptor: knownAgentDescriptor,
          workspaceRoot: getContext().environment.getCwd(),
          taskPrompt: dryRunPrompt,
          mode: 'dry-run',
          outputMode: 'text',
        })
        : {
          command: tool,
          args: ['--message', dryRunPrompt],
          preview: '',
        };
      const dryRunCommand = buildCommandString(dryRunGenerated.command, dryRunGenerated.args);
      getLogger().info(`[dry-run] 将预览: ${dryRunCommand}`);
      return {
        success: true,
        output: '',
        command: dryRunCommand,
        commandGenerationPath: knownAgentDescriptor && knownAgentAdapter ? 'adapter' : 'llm-fallback',
        fallbackUsed: false,
        agentTaskContract: agentTaskContractSummary,
      };
    }

    let generated: GeneratedCommand;
    let fallbackUsed = false;
    const commandGenerationPath = knownAgentDescriptor && knownAgentAdapter ? 'adapter' : 'llm-fallback';

    if (knownAgentDescriptor && knownAgentAdapter) {
      const adapterOutput = knownAgentAdapter.render({
        descriptor: knownAgentDescriptor,
        workspaceRoot: getContext().environment.getCwd(),
        taskPrompt: buildDefaultPrompt(taskId, label, docPath, agentTaskContract),
        mode: 'run',
        outputMode: 'text',
      });
      generated = {
        command: adapterOutput.command,
        args: adapterOutput.args,
        explanation: `使用 ${knownAgentDescriptor.id} adapter 生成确定性命令`,
      };
      const globalConfigDigest = `adapter=${knownAgentDescriptor.id}`;
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
    } else {
      const llmConfig = await withSpan('cli.run-task.loadLlmConfig', async () => {
        const config = createLLMConfig();
        if (!config) {
          throw new Error('LLM 未配置，请先运行 vectahub setup 配置 AI 提供商');
        }
        return config;
      }, { context: traceContext, parentSpanId: rootSpan.spanId, source: 'cli', attributes: baseAttributes });
      const llmTemperatureRaw = process.env.VECTAHUB_LLM_TEMPERATURE;
      const llmTemperature = llmTemperatureRaw !== undefined ? Number.parseFloat(llmTemperatureRaw) : 0.1;
      const globalConfigDigest = buildGlobalConfigDigest({
        provider: llmConfig.provider,
        model: llmConfig.model,
        temperature: Number.isFinite(llmTemperature) ? llmTemperature : 0.1,
      });
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

      const cacheManager = getToolCacheManager(getContext());
      const discoverSpan = startSpan('cli.run-task.discoverToolHelp', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          knownAgentDescriptor: knownAgentDescriptor?.id || '',
          commandGenerationPath,
        },
      });
      const cacheEntry = await cacheManager.discoverToolHelp(tool);
      await discoverSpan.end({ helpLength: cacheEntry.helpOutput.length });

      const client = new LLMClient(llmConfig);

      const generateSpan = startSpan('cli.run-task.generateCommand', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          commandGenerationPath,
        },
      });
      const { summary, ...agentTaskContractForPrompt } = agentTaskContract;
      void summary;
      let rawOutput: string;
      try {
        const llmOutput = await client.completeRaw(AGENT_CMD_GENERATOR_ID, `任务 ${taskId}: ${label}，请基于工具用法和任务边界合同生成执行命令。`, {
          toolName: tool,
          helpOutput: cacheEntry.helpOutput,
          taskId,
          taskLabel: label,
          docPath,
          agentTaskContract: JSON.stringify(agentTaskContractForPrompt),
          agentTaskContractSummary: JSON.stringify(agentTaskContractSummary),
        });
        rawOutput = llmOutput;
      } catch (error) {
        await generateSpan.fail(error, { fallbackUsed: false, command: '' });
        throw error;
      }

      try {
        const cleaned = rawOutput.trim();
        const jsonStr = extractOutermostJson(cleaned);
        if (!jsonStr) {
          throw new Error('LLM 输出中未找到有效的 JSON');
        }
        generated = JSON.parse(jsonStr) as GeneratedCommand;
      } catch {
        fallbackUsed = true;
        getLogger().warn(`LLM 命令生成失败，使用默认提示词模式。原始输出: ${rawOutput.substring(0, 200)}`);
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
    }

    const fullCommand = buildCommandString(generated.command, generated.args);
    if (commandGenerationPath === 'llm-fallback') {
      const invocationValidation = validateGeneratedInvocation(tool, generated);
      if (!invocationValidation.valid) {
        const validationErrorMessage = `${invocationValidation.message}；已阻断执行`;
        getLogger().error(validationErrorMessage);
        return {
          success: false,
          output: validationErrorMessage,
          command: fullCommand,
          commandGenerationPath,
          fallbackUsed,
          error: {
            code: 'INVALID_INVOCATION',
            message: invocationValidation.message,
          },
          agentTaskContract: agentTaskContractSummary,
        };
      }
    }

    const guard = getSecurityGuard();
    const securityContext: SecurityContext = {
      cwd: getContext().environment.getCwd(),
      sessionId: traceContext.traceId,
      taskId: taskId,
      isDryRun: Boolean(dryRun)
    };
    const commandIntention: CommandIntention = {
      rawCommand: fullCommand,
      tool: generated.command,
      args: generated.args,
    };

    const securitySpan = startSpan('cli.run-task.securityCheck', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: {
        ...baseAttributes,
        commandGenerationPath,
      },
    });

    const decision = await guard.assess(commandIntention, securityContext);

    await securitySpan.end({
      dangerous: decision.decision !== 'PASSED',
      severity: decision.riskLevel,
      ruleName: decision.ruleName || '',
      command: limitText(fullCommand),
      fallbackUsed,
    });

    // Build risk assessment for the main command
    let riskAssessment: RunTaskRiskAssessment | undefined;
    const legacyDetection = getSecurityManager().detectCommand(fullCommand, generated.command);
    if (legacyDetection.isDangerous && legacyDetection.severity === 'critical') {
      const ruleName = legacyDetection.rule?.name || 'Unknown Rule';
      getLogger().error(`安全策略拦截: 命令匹配规则 "${ruleName}" (risk: critical)`);
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `命令被安全策略拦截: ${legacyDetection.rule?.description || '未授权操作'}`,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        riskAssessment: {
          level: 'critical',
          ruleName,
          needsConfirmation: true,
          enforcement: 'blocked',
          phase: 'command',
          confirmationSource: 'preflight',
          blockedCommand: limitText(fullCommand),
        },
        error: {
          code: 'SECURITY_BLOCKED',
          message: `安全策略拦截: ${ruleName}`,
        },
        agentTaskContract: agentTaskContractSummary,
      };
    }
    if (legacyDetection.isDangerous && legacyDetection.severity === 'high') {
      riskAssessment = {
        level: 'high',
        ruleName: legacyDetection.rule?.name,
        needsConfirmation: true,
        enforcement: 'confirm_required',
        phase: 'command',
        confirmationSource: 'preflight',
        blockedCommand: limitText(fullCommand),
      };
      getLogger().warn(`命令风险评级: ${riskAssessment.level} (${riskAssessment.ruleName || 'unknown'}) — 无确认能力，执行前阻断`);
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `高风险命令需确认，当前调用链无确认能力: ${riskAssessment.ruleName || 'unknown'}`,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        riskAssessment,
        error: {
          code: 'SECURITY_BLOCKED',
          message: `高风险命令需确认: ${riskAssessment.ruleName || 'unknown'}`,
        },
        agentTaskContract: agentTaskContractSummary,
      };
    }

    if (decision.decision === 'BLOCKED') {
      const ruleName = decision.ruleName || 'Unknown Rule';
      getLogger().error(`安全策略拦截: 命令匹配规则 "${ruleName}" (risk: ${decision.riskLevel})`);
      getLogger().error(`拦截原因: ${decision.reason || '无'}`);
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `命令被安全策略拦截: ${decision.reason || '未授权操作'}`,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        riskAssessment: {
          level: decision.riskLevel,
          ruleName: decision.ruleName,
          needsConfirmation: true,
          enforcement: 'blocked',
          phase: 'command',
          confirmationSource: 'preflight',
          blockedCommand: limitText(fullCommand),
        },
        error: {
          code: 'SECURITY_BLOCKED',
          message: `安全策略拦截: ${ruleName}`,
        },
        agentTaskContract: agentTaskContractSummary,
      };
    }

    if (decision.decision === 'REQUIRES_CONFIRMATION') {
      riskAssessment = {
        level: decision.riskLevel,
        ruleName: decision.ruleName,
        needsConfirmation: true,
        enforcement: 'confirm_required',
        phase: 'command',
        confirmationSource: 'preflight',
        blockedCommand: limitText(fullCommand),
      };
      getLogger().warn(`命令风险评级: ${riskAssessment.level} (${riskAssessment.ruleName || 'unknown'}) — 无确认能力，执行前阻断`);
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `高风险命令需确认，当前调用链无确认能力: ${riskAssessment.ruleName || 'unknown'}`,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        riskAssessment,
        error: {
          code: 'SECURITY_BLOCKED',
          message: `高风险命令需确认: ${riskAssessment.ruleName || 'unknown'}`,
        },
        agentTaskContract: agentTaskContractSummary,
      };
    }

    if (decision.decision === 'REDACTED' || decision.riskLevel !== 'none') {
      riskAssessment = {
        level: decision.riskLevel,
        ruleName: decision.ruleName,
        needsConfirmation: false,
        phase: 'command',
      };
      getLogger().warn(`命令风险提示: ${riskAssessment.level} (${riskAssessment.ruleName || 'unknown'})`);
    }

    const validationRisk = await detectValidationPreflightRisk(agentTaskContractSummary.validationCommands, securityContext);
    if (validationRisk) {
      getLogger().warn(`验证命令风险评级: ${validationRisk.level} (${validationRisk.ruleName || 'unknown'}) — 无确认能力，执行前阻断`);
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `验证命令存在高风险，需确认后才能执行: ${validationRisk.blockedCommand || 'unknown'}`,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        riskAssessment: validationRisk,
        error: {
          code: 'SECURITY_BLOCKED',
          message: `验证命令高风险需确认: ${validationRisk.ruleName || validationRisk.blockedCommand || 'unknown'}`,
        },
        agentTaskContract: agentTaskContractSummary,
      };
    }

    getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'EXECUTING', 'run-task');

    let runtimeEnvPatch: Record<string, string> | undefined;
    if (knownAgentDescriptor) {
      try {
        const bootstrapResult = await bootstrapAgentRuntime({
          descriptor: knownAgentDescriptor,
          workspaceRoot: getContext().environment.getCwd(),
        });
        runtimeEnvPatch = bootstrapResult.envPatch;
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error
          ? `Agent runtime bootstrap 失败: ${bootstrapError.message}`
          : 'Agent runtime bootstrap 失败';
        getLogger().error(message);
        getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'PREFLIGHT_FAILED', 'run-task');
        return {
          success: false,
          output: message,
          command: fullCommand,
          commandGenerationPath,
          fallbackUsed,
          error: {
            code: 'AGENT_CONFIG_ERROR',
            message,
          },
          agentTaskContract: agentTaskContractSummary,
        };
      }
    }

    const childEnv = buildAgentChildEnv(traceContext, rootSpan.spanId, runtimeEnvPatch);

    // Agent availability preflight check
    if (!dryRun) {
      const preflightSpan = startSpan('cli.run-task.agentPreflight', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          commandGenerationPath,
        },
      });
      const preflightArgs = commandGenerationPath === 'adapter'
        ? (
          knownAgentDescriptor?.preflightSpec.readyArgs?.length
            ? knownAgentDescriptor.preflightSpec.readyArgs
            : knownAgentDescriptor?.preflightSpec.invocableArgs?.length
              ? knownAgentDescriptor.preflightSpec.invocableArgs
              : ['--version']
        )
        : ['--version'];
      const preflightCheckLabel = commandGenerationPath === 'adapter' && knownAgentDescriptor?.preflightSpec.readyArgs?.length
        ? '就绪检查'
        : '入口检查';
      try {
        await getContext().environment.exec([generated.command, ...preflightArgs].join(' '), {
          timeout: 10000,
          cwd: getContext().environment.getCwd(),
          env: childEnv,
        });
        await preflightSpan.end({ agentAvailable: true });
      } catch (preflightError) {
        const preflightMsg = `Agent CLI "${generated.command}" 未通过${preflightCheckLabel}`;
        const preflightErrorCode = classifyAgentFailureCode(preflightError, preflightMsg);
        await preflightSpan.fail(preflightError, { agentAvailable: false });
        getLogger().error(preflightMsg);
        getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'PREFLIGHT_FAILED', 'run-task');
        return {
          success: false,
          output: preflightMsg,
          command: fullCommand,
          commandGenerationPath,
          fallbackUsed,
          error: {
            code: preflightErrorCode,
            message: preflightMsg,
          },
          agentTaskContract: agentTaskContractSummary,
        };
      }
    }

    getLogger().info(`执行: ${fullCommand}`);
    if (generated.explanation) {
      getLogger().info(`说明: ${generated.explanation}`);
    }

    const gitDiffBefore = await readGitDiffSnapshot();
    try {
      const spawnSpan = startSpan('cli.run-task.spawnAgent', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          commandGenerationPath,
          fallbackUsed,
          command: limitText(fullCommand),
          timeoutMs: getAgentCliTimeout(),
        },
      });

      const child = getContext().environment.spawn(generated.command, generated.args, {
        cwd: getContext().environment.getCwd(),
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let capturedUsage: TokenUsage | undefined;
      const onToken = (u: TokenUsage) => {
        if (!capturedUsage) {
          capturedUsage = u;
        } else {
          capturedUsage.promptTokens = Math.max(capturedUsage.promptTokens, u.promptTokens);
          capturedUsage.completionTokens = Math.max(capturedUsage.completionTokens, u.completionTokens);
          capturedUsage.totalTokens = Math.max(capturedUsage.totalTokens, u.totalTokens);
        }
      };

      const stdoutRedactor = new RedactionTransform(undefined, onToken);
      const stderrRedactor = new RedactionTransform(undefined, onToken);

      let redactedStdout = '';
      let redactedStderr = '';

      child.stdout?.pipe(stdoutRedactor);
      child.stderr?.pipe(stderrRedactor);

      stdoutRedactor.on('data', (chunk: Buffer | string) => {
        redactedStdout += chunk.toString();
      });
      stderrRedactor.on('data', (chunk: Buffer | string) => {
        redactedStderr += chunk.toString();
      });

      const streamDrainPromise = Promise.all([
        waitForWriterSettled(stdoutRedactor),
        waitForWriterSettled(stderrRedactor),
      ]);
      const completion = await new Promise<SpawnCompletionResult>((resolvePromise, rejectPromise) => {
        let settled = false;
        let closeObserved = false;
        let exitCode: number | null = null;
        let exitSignal: NodeJS.Signals | null = null;
        let exitFlushTimer: NodeJS.Timeout | undefined;

        const cleanup = () => {
          clearTimeout(timer);
          if (exitFlushTimer) {
            clearTimeout(exitFlushTimer);
          }
          child.off('error', onErr);
          child.off('exit', onExit);
          child.off('close', onClose);
          stdoutRedactor.off('error', onErr);
          stderrRedactor.off('error', onErr);
        };
        const resolveOnce = (value: SpawnCompletionResult) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolvePromise(value);
        };
        const rejectOnce = (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          rejectPromise(error as Error);
        };
        const settleWithExit = (code: number | null, signal: NodeJS.Signals | null, completionSignal: SpawnCompletionSignal) => {
          const normalizedCode = typeof code === 'number' ? code : 1;
          if (normalizedCode === 0) {
            resolveOnce({ exitCode: 0, signal, completionSignal });
            return;
          }

          const message = signal
            ? `Agent process exited with signal ${signal}`
            : `Agent process exited with code ${code}`;
          rejectOnce(Object.assign(new Error(message), {
            code: normalizedCode,
            signal,
            completionSignal,
            stdout: redactedStdout,
            stderr: redactedStderr,
          }));
        };

        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          const timeoutError = new Error(`Agent CLI timeout after ${getAgentCliTimeout()}ms`);
          const enrichedTimeoutError = timeoutError as Error & {
            code?: string;
            completionSignal?: SpawnCompletionSignal;
            stdout?: string;
            stderr?: string;
          };
          enrichedTimeoutError.code = 'TIMEOUT';
          enrichedTimeoutError.completionSignal = 'timeout';
          enrichedTimeoutError.stdout = redactedStdout;
          enrichedTimeoutError.stderr = redactedStderr;
          rejectOnce(timeoutError);
        }, getAgentCliTimeout());
        const onErr = (err: unknown) => {
          const executionError = err as CommandExecutionError;
          if (executionError.stdout === undefined) {
            executionError.stdout = redactedStdout;
          }
          if (executionError.stderr === undefined) {
            executionError.stderr = redactedStderr;
          }
          rejectOnce(executionError);
        };
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
          exitCode = code;
          exitSignal = signal;

          streamDrainPromise
            .then(() => {
              if (settled || closeObserved) return;
              settleWithExit(exitCode, exitSignal, 'exit-stream-drain');
            })
            .catch(onErr);

          if (exitFlushTimer) {
            clearTimeout(exitFlushTimer);
          }
          exitFlushTimer = setTimeout(() => {
            if (settled || closeObserved) return;
            settleWithExit(exitCode, exitSignal, 'exit-flush-grace');
          }, getAgentExitFlushGraceMs());
        };
        const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
          closeObserved = true;
          streamDrainPromise
            .then(() => {
              if (settled) return;
              settleWithExit(code, signal, 'close');
            })
            .catch(onErr);

          if (exitFlushTimer) {
            clearTimeout(exitFlushTimer);
          }
          exitFlushTimer = setTimeout(() => {
            if (settled) return;
            settleWithExit(code, signal, 'close');
          }, getAgentExitFlushGraceMs());
        };

        streamDrainPromise.catch(onErr);
        child.on('error', onErr);
        child.on('exit', onExit);
        child.on('close', onClose);
        stdoutRedactor.on('error', onErr);
        stderrRedactor.on('error', onErr);
      });

      await spawnSpan.end({
        stdoutLength: redactedStdout.length,
        stderrLength: redactedStderr.length,
        exitCode: completion.exitCode,
        completionSignal: completion.completionSignal,
      });

      const combinedOutput = `${redactedStdout}${redactedStderr ? `\n${redactedStderr}` : ''}`;
      const agentExecutionOutcome = detectAgentExecutionOutcome(combinedOutput);
      
      const collectSpan = startSpan('cli.run-task.collectGitChanges', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: baseAttributes,
      });
      const gitChanges = await collectGitChanges(gitDiffBefore) ?? undefined;
      await collectSpan.end({ changedFileCount: gitChanges?.changedFiles.length || 0 });
      const softSystemFailureMessage = detectAgentSoftSystemFailure(combinedOutput, gitChanges);
      const postExecutionConfirmation = detectPostExecutionConfirmation({
        gitChanges,
        allowedFiles: agentTaskContractSummary.allowedFiles,
        forbiddenFiles: agentTaskContractSummary.forbiddenFiles,
      });
      if (postExecutionConfirmation) {
        await persistRunTaskFailureLogs(taskId, {
          stdout: redactedStdout,
          stderr: redactedStderr,
        });
        getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
        getLogger().warn(`检测到执行后确认: ${postExecutionConfirmation.reason} (${postExecutionConfirmation.matchedFiles.join(', ')})`);
        const failureKind = 'agent';
        const unclosedExecution = isUnclosedExecutionFailure({
          success: false,
          gitChanges,
          verification: undefined,
        });
        const recoveryDecision = buildRecoveryDecisionSummary({
          failureKind,
          gitChanges,
          verification: undefined,
          agentTaskContract: agentTaskContractSummary,
        });
        return {
          success: false,
          output: combinedOutput,
          command: fullCommand,
          commandGenerationPath,
          fallbackUsed,
          agentExecutionOutcome: 'implemented',
          completionSignal: completion.completionSignal,
          riskAssessment: {
            level: 'high',
            ruleName: postExecutionConfirmation.reason,
            needsConfirmation: true,
            enforcement: 'confirm_required',
            confirmationSource: 'post-execution',
            blockedCommand: postExecutionConfirmation.matchedFiles.join(', '),
          },
          error: {
            code: 'NEEDS_CONFIRMATION',
            message: `检测到执行后确认: ${postExecutionConfirmation.reason}`,
          },
          gitChanges,
          agentTaskContract: agentTaskContractSummary,
          usage: capturedUsage,
          failureKind,
          unclosedExecution,
          recoveryDecision,
        };
      }
      
      let verification: VerificationResult | undefined;
      const validationCommands = agentTaskContractSummary.validationCommands;
      if (validationCommands.length > 0 && agentExecutionOutcome !== 'planned_only' && !softSystemFailureMessage) {
        const verificationSpan = startSpan('cli.run-task.verification', {
          context: traceContext,
          parentSpanId: rootSpan.spanId,
          source: 'cli',
          attributes: {
            ...baseAttributes,
            verificationCommandCount: validationCommands.length,
          },
        });
        try {
          verification = await runVerificationCommands(validationCommands, getContext().environment.getCwd());
          await verificationSpan.end({
            verificationOk: verification.ok,
            verificationIsSystemError: !!verification.isSystemError,
            verificationTotalCommands: verification.commands.length,
            verificationPassedCommands: verification.commands.filter(c => c.ok).length,
            verificationFailedCommands: verification.commands.filter(c => !c.ok).length,
            verificationTotalDurationMs: verification.commands.reduce((sum, c) => sum + c.durationMs, 0),
          });
          getLogger().info(`验证完成: ${verification.ok ? '通过' : '失败'} (${verification.commands.length} 条命令)${verification.isSystemError ? ' [系统错误]' : ''}`);
        } catch (error) {
          verification = { ok: false, commands: [], isSystemError: true };
          await verificationSpan.fail(error);
          getLogger().error('验证执行异常');
        }
      }

      const finalSuccess = !softSystemFailureMessage
        && agentExecutionOutcome !== 'planned_only'
        && (verification ? (verification.ok && !verification.isSystemError) : true);
      const unclosedExecution = isUnclosedExecutionFailure({
        success: finalSuccess,
        gitChanges,
        verification,
      });
      if (softSystemFailureMessage) {
        getLogger().warn('任务 Agent 输出环境受限，按系统错误处理');
      } else if (!finalSuccess && verification?.ok) {
        getLogger().warn('任务 Agent 成功但验证发生系统错误');
      } else if (!finalSuccess) {
        getLogger().warn('任务 Agent 成功但验证失败');
      }
      if (unclosedExecution) {
        getLogger().warn('检测到未收口执行：失败 + 已有 gitChanges + verification 缺失');
      }

      // Usage is now captured in real-time
      const usage = capturedUsage;
      if (usage) {
        getLogger().info(`Token 消耗 (实时捕获): prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`);
      }

      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
      getLogger().info(finalSuccess ? '任务执行成功' : '任务执行完成（验证失败或系统错误）');
      if (gitChanges) {
        getLogger().info(`变更文件: ${gitChanges.changedFiles.length} 个`);
      }
      if (!finalSuccess) {
        await persistRunTaskFailureLogs(taskId, {
          stdout: redactedStdout,
          stderr: redactedStderr,
        });
      }
      return {
        success: finalSuccess,
        output: combinedOutput,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        agentExecutionOutcome,
        completionSignal: completion.completionSignal,
        error: agentExecutionOutcome === 'planned_only'
          ? { code: 'AGENT_PLANNED_ONLY', message: 'Agent 仅输出计划，未执行实现' }
          : softSystemFailureMessage
            ? { code: 'AGENT_SYSTEM_ERROR', message: softSystemFailureMessage }
          : undefined,
        gitChanges,
        agentTaskContract: agentTaskContractSummary,
        verification,
        usage,
        failureKind: inferExecutionFailureKind({
          agentExecutionOutcome,
          softSystemFailureMessage,
          verification,
        }),
        unclosedExecution,
        recoveryDecision: !finalSuccess
          ? buildRecoveryDecisionSummary({
              failureKind: inferExecutionFailureKind({
                agentExecutionOutcome,
                softSystemFailureMessage,
                verification,
              }),
              gitChanges,
              verification,
              agentTaskContract: agentTaskContractSummary,
            })
          : undefined,
      };
    } catch (error) {
      const execError = error as CommandExecutionError;
      const errStdout = execError.stdout?.toString?.() || '';
      const errStderr = execError.stderr?.toString?.() || '';
      const errOutput = errStdout + (errStderr ? '\n' + errStderr : '') || execError.message || String(error);
      const rawErrOutputForUsage = errStdout + (errStderr ? '\n' + errStderr : '');
      await persistRunTaskFailureLogs(taskId, {
        stdout: errStdout,
        stderr: errStderr,
      });
      const spawnFailSpan = startSpan('cli.run-task.spawnAgent', {
        context: traceContext,
        parentSpanId: rootSpan.spanId,
        source: 'cli',
        attributes: {
          ...baseAttributes,
          fallbackUsed,
          command: limitText(fullCommand),
          timeoutMs: getAgentCliTimeout(),
        },
      });
      const completionSignal = execError.completionSignal;
      const gitChanges = await collectGitChanges(gitDiffBefore) ?? undefined;
      const unclosedExecution = isUnclosedExecutionFailure({
        success: false,
        gitChanges,
        verification: undefined,
      });
      await spawnFailSpan.fail(error, {
        stdoutLength: errStdout.length,
        stderrLength: errStderr.length,
        exitCode: execError.code ?? null,
        completionSignal,
        unclosedExecution,
      });
      getAuditHelper().securityAction('RUN_TASK', `${tool}:${taskId}`, 'FAILED', 'run-task');
      getLogger().error(`任务执行失败: ${errOutput}`);
      if (unclosedExecution) {
        getLogger().warn('检测到未收口执行：失败 + 已有 gitChanges + verification 缺失');
      }
      const errUsage = parseTokenUsage(rawErrOutputForUsage || errOutput);
      const errorCode = classifyAgentFailureCode(execError, errOutput);
      const failureKind = mapErrorCodeToFailureKind(errorCode, undefined)
        ?? (completionSignal === 'timeout' ? 'timeout' : 'agent');
      const errorMessage = execError?.message || 'Agent 执行失败';
      const recoveryDecision = buildRecoveryDecisionSummary({
        failureKind,
        gitChanges,
        verification: undefined,
        agentTaskContract: agentTaskContractSummary,
      });
      return {
        success: false,
        output: errOutput,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        agentExecutionOutcome: unclosedExecution ? 'implemented' : undefined,
        completionSignal,
        error: {
          code: errorCode,
          message: errorMessage,
        },
        gitChanges,
        agentTaskContract: agentTaskContractSummary,
        usage: errUsage,
        failureKind,
        unclosedExecution,
        recoveryDecision,
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

export function createRunTaskCmd(_context: InfrastructureContext): Command {
  bindRunTaskContext(_context);
  return new Command('run-task')
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
      let deferredTraceCloseout: RunTaskTraceCloseout | undefined;
      try {
        const result = await runTask({
          ...options,
          deferTraceCloseout: Boolean(options.json),
        });
        deferredTraceCloseout = getRunTaskTraceCloseout(result);

        if (options.json) {
          const jsonOutput = formatRunTaskJson(result);
          if (!deferredTraceCloseout) {
            console.log(JSON.stringify(jsonOutput, null, 2));
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
              console.log(rendered);
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
          console.log(result.output);
          throw new VectaHubError('Task execution failed', ErrorType.RUNTIME);
        } else {
          console.log(result.output);
        }
      } catch (error) {
        if (!deferredTraceCloseout && typeof error === 'object' && error !== null) {
          deferredTraceCloseout = getRunTaskTraceCloseout(error);
        }
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          const errorJson = { ok: false, error: { code: 'CLI_ERROR', message } };
          if (!deferredTraceCloseout) {
            console.log(JSON.stringify(errorJson, null, 2));
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
              console.log(rendered);
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
  return new Command('run-task-clean-logs')
    .description('清理当前工作目录下的 run-task 失败日志')
    .option('--json', '以 JSON 格式输出')
    .action(async (options: { json?: boolean }) => {
      const cleanupResult = await cleanRunTaskLogs();
      if (options.json) {
        console.log(JSON.stringify({
          ok: true,
          removedFiles: cleanupResult.removedFiles,
        }, null, 2));
        return;
      }

      console.log(`Cleared ${cleanupResult.removedFiles} run-task failure log files.`);
    });
}

let boundRunTaskCmd: Command | null = null;
let boundRunTaskCleanLogsCmd: Command | null = null;

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
