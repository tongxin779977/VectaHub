import type { InfrastructureContext } from '../infrastructure/context.js';
import { getVectaHubPath, djb2Hash } from '../infrastructure/paths/index.js';
import type { DocTaskFailureKind } from '../types/doc-task.js';
import type { RunTaskReviewFinding } from './run-task-review.js';

let boundContext: InfrastructureContext | null = null;

export interface RunTaskCommandOutput {
  log(message?: unknown): void;
  json(payload: unknown, options?: { space?: number }): void;
  renderedJson(rendered: string): void;
}

export interface CommandExecutionError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  status?: number | null;
  code?: string | number | null;
  killed?: boolean;
  completionSignal?: SpawnCompletionSignal;
  signal?: NodeJS.Signals | null;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GitChangeInfo {
  diffStat: string;
  shortStat: string;
  changedFiles: string[];
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

export interface AgentTaskContractSummary {
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  allowedFiles: string[];
  forbiddenFiles: string[];
  relatedFiles: string[];
  validationCommands: string[];
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
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

export type SpawnCompletionSignal = 'close' | 'exit-stream-drain' | 'exit-flush-grace' | 'output-last-message' | 'evidence-closeout' | 'timeout';

export interface RunTaskRecoveryDecisionSummary {
  kind: string;
  mode: string;
  summary: string;
}

export interface RunTaskReviewReport {
  taskId: string;
  taskLabel: string;
  status: string;
  changedFiles: string[];
  validationPassed: boolean;
  findings: RunTaskReviewFinding[];
  needsHumanReview: boolean;
}

export interface GeneratedCommand {
  command: string;
  args: string[];
  explanation: string;
  stdinInput?: string;
}

export interface RunTaskLogCleanupResult {
  removedFiles: number;
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

export const DEFAULT_AGENT_CLI_TIMEOUT = 600000;
export const DEFAULT_MAX_JSON_OUTPUT_LENGTH = 50000;
export const TRUNCATED_OUTPUT_MARKER = '\n... (output truncated)';
export const TRACE_TEXT_MAX_LENGTH = 500;
export const PROMPT_CONTRACT_MAX_LENGTH = 12000;
export const MAX_VERIFICATION_COMMANDS = 10;
export const VERIFICATION_SUMMARY_MAX_LENGTH = 600;
export const FAILURE_HUMAN_SUMMARY_MAX_LENGTH = 600;
export const OUTPUT_LAST_MESSAGE_POLL_MS = 100;
export const RUN_TASK_FAILURE_LOG_RETENTION_DAYS = 7;

export function createRunTaskCommandOutput(): RunTaskCommandOutput {
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

export function getContext(): InfrastructureContext {
  if (!boundContext) {
    throw new Error('run-task context is not bound. Use bindRunTaskContext(context) first.');
  }
  return boundContext;
}

export function bindRunTaskContext(context: InfrastructureContext): void {
  boundContext = context;
}

export function getLogger() {
  return getContext().logger.getLogger('run-task');
}

export function getAuditHelper() {
  return getContext().audit.getHelper();
}

export function stripIDEEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(getContext().environment.getAllEnv())) {
    if (!IDE_ENV_PATTERNS.some(p => p.test(key))) {
      env[key] = value;
    }
  }
  return env;
}

export function getAgentCliTimeout(): number {
  return getContext().environment.getEnvNumber('AGENT_CLI_TIMEOUT', DEFAULT_AGENT_CLI_TIMEOUT) ?? DEFAULT_AGENT_CLI_TIMEOUT;
}

export function getMaxJsonOutputLength(): number {
  if (!boundContext) {
    return DEFAULT_MAX_JSON_OUTPUT_LENGTH;
  }
  return boundContext.environment.getEnvNumber('RUN_TASK_MAX_JSON_OUTPUT_LENGTH', DEFAULT_MAX_JSON_OUTPUT_LENGTH) ?? DEFAULT_MAX_JSON_OUTPUT_LENGTH;
}

export function extractOutermostJson(str: string): string | null {
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

export function waitForWriterSettled(writer: NodeJS.WritableStream): Promise<void> {
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
      writer.removeListener('error', onErr);
    };
    const onDone = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onErr = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error as Error);
    };

    writer.once('finish', onDone);
    writer.once('close', onDone);
    writer.once('error', onErr);
  });
}

export function buildCommandString(command: string, args: string[]): string {
  const escaped = args.map(a => {
    if (/[\s"']/.test(a)) {
      return `"${a.replace(/"/g, '\\"')}"`;
    }
    return a;
  });
  return [command, ...escaped].join(' ');
}

export function limitText(value: string): string {
  if (value.length <= TRACE_TEXT_MAX_LENGTH) return value;
  return `${value.slice(0, TRACE_TEXT_MAX_LENGTH)}...`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeContractPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export function getRunTaskOutputDir(): string {
  return getVectaHubPath('outputs', 'run-task', djb2Hash(getContext().environment.getCwd()));
}

export function getRunTaskOutputDirCandidates(): string[] {
  const preferredDir = getRunTaskOutputDir();
  const fallbackDir = getContext().environment.resolvePath(getContext().environment.getTmpDir(), 'vectahub', 'outputs', 'run-task', djb2Hash(getContext().environment.getCwd()));
  return Array.from(new Set(preferredDir === fallbackDir ? [preferredDir] : [preferredDir, fallbackDir]));
}

export async function ensureRunTaskOutputDir(): Promise<string> {
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

export async function createRunTaskOutputFilePath(taskId: string, extension: string): Promise<string> {
  const outputDir = await ensureRunTaskOutputDir();
  return getContext().environment.resolvePath(outputDir, `${taskId}-${Date.now()}.${extension}`);
}

export function readRunTaskOutputFile(path: string | undefined): string {
  if (!path || !getContext().environment.exists(path)) {
    return '';
  }
  return getContext().environment.readFile(path);
}

type RunTaskOutputStreamKind = 'stdout' | 'stderr';

export interface RunTaskOutputEntry {
  path: string;
  timestamp: number;
  taskId: string;
  stream: RunTaskOutputStreamKind;
}

export function parseRunTaskOutputEntry(outputDir: string, fileName: string): RunTaskOutputEntry | null {
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

export function listRunTaskOutputEntries(outputDir: string): RunTaskOutputEntry[] {
  return getContext().environment.readDir(outputDir)
    .map(fileName => parseRunTaskOutputEntry(outputDir, fileName))
    .filter((entry): entry is RunTaskOutputEntry => entry !== null);
}

export function getRunTaskFailureLogRetentionCutoff(now: number = Date.now()): number {
  return now - (RUN_TASK_FAILURE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
