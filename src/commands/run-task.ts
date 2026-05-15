import { Command } from 'commander';
import { execFile, spawn } from 'node:child_process';
import { existsSync, createWriteStream, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { Transform } from 'node:stream';
import { getLogger } from '../utils/logger.js';
import { assessCommandRisk } from '../security-protocol/engine.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { AGENT_CMD_GENERATOR_ID } from '../nl/prompt-manager.js';
import { getToolCacheManager } from '../cli-tools/discovery/cache-manager.js';
import { getSecurityManager } from '../security-protocol/manager.js';
import { audit } from '../infrastructure/audit/index.js';
import { createChildEnv, getTraceContextFromEnv, startSpan, withSpan } from '../infrastructure/trace/index.js';
import { deriveAgentTaskBoundary, deriveDocExcerpt, computeInstructionHash } from './agent-task-contract.js';
import type { AgentTaskContract } from '../types/doc-task.js';
import { splitPosixArgs } from '../utils/shell.js';
import { createRedactor } from '../security-protocol/redactor.js';
import { getVectaHubPath, djb2Hash } from '../utils/paths.js';
import { getAgentAdapterById, getAgentDescriptorById } from './agent-cli-adapter.js';
import { bootstrapAgentRuntime } from './agent-runtime-bootstrap.js';

const execFileAsync = promisify(execFile);
const logger = getLogger('run-task');
const IDE_ENV_PATTERNS = [
  /^CODEX_(?!HOME$)/,
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
const DEFAULT_AGENT_EXIT_FLUSH_GRACE_MS = 1500;
const agentExitFlushGraceMs = parseInt(process.env.AGENT_EXIT_FLUSH_GRACE_MS || '', 10) || DEFAULT_AGENT_EXIT_FLUSH_GRACE_MS;
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
  /xterm\.js:\s*parsing error.*/i,
];
const TRACE_TEXT_MAX_LENGTH = 500;
const PROMPT_CONTRACT_MAX_LENGTH = 12000;
const MAX_VERIFICATION_COMMANDS = 10;
const DEFAULT_VERIFICATION_TIMEOUT = 120000;
const verificationTimeout = parseInt(process.env.VERIFICATION_TIMEOUT_MS || '', 10) || DEFAULT_VERIFICATION_TIMEOUT;
const VERIFICATION_SUMMARY_MAX_LENGTH = 600;
const redactor = createRedactor();

class RedactionTransform extends Transform {
  private carry = '';
  private onTokenUsage?: (usage: TokenUsage) => void;

  constructor(options?: any, onTokenUsage?: (usage: TokenUsage) => void) {
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
}

export interface RunTaskRiskAssessment {
  level: string;
  ruleName?: string;
  needsConfirmation: boolean;
}

export interface RunTaskJsonResult {
  ok: boolean;
  command: string;
  output: string;
  outputTruncated: boolean;
  commandGenerationPath?: 'adapter' | 'llm-fallback';
  fallbackUsed?: boolean;
  agentExecutionOutcome?: 'implemented' | 'planned_only';
  error?: string | {
    code: string;
    message: string;
  };
  agentTaskContract?: AgentTaskContractSummary;
  gitChanges?: {
    shortStat: string;
    changedFiles: string[];
    diffStat: string;
  };
  verification?: VerificationResult;
  riskAssessment?: RunTaskRiskAssessment;
  usage?: TokenUsage;
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

function buildGlobalConfigDigest(input: { model?: string; temperature?: number }): string {
  const model = (input.model || '').trim() || 'unknown';
  const temperature = Number.isFinite(input.temperature) ? String(input.temperature) : 'default';
  return `model=${model};temperature=${temperature}`;
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
}): Promise<AgentTaskContract & { summary: AgentTaskContractSummary }> {
  let docExcerpt = '';
  let docExcerptTruncated = false;
  let excerptStrategy: AgentTaskContractSummary['excerptStrategy'] = 'none';
  const notes: string[] = [];

  if (input.docPath && existsSync(input.docPath)) {
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
    instructionHash: computeInstructionHash(
      input.taskId, input.label, docExcerpt,
      undefined, // tool is not available at contract build time
      boundary.allowedFiles,
      boundary.forbiddenFiles,
    ),
  };

  return { ...contract, summary };
}

function readPackageScripts(projectRoot: string): string[] {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
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
  return splitPosixArgs(cmd);
}

function getRunTaskOutputDir(): string {
  return getVectaHubPath('outputs', 'run-task', djb2Hash(process.cwd()));
}

async function safeReadTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function findLatestRunTaskOutputFiles(taskId: string): { stdoutPath?: string; stderrPath?: string } | null {
  const outputDir = getRunTaskOutputDir();
  if (!existsSync(outputDir)) {
    return null;
  }

  const stdoutEntries = Array.from(new Set([
    ...globOutputCandidates(outputDir, `${taskId}-`, '.stdout'),
  ])).sort();
  const stderrEntries = Array.from(new Set([
    ...globOutputCandidates(outputDir, `${taskId}-`, '.stderr'),
  ])).sort();

  return {
    stdoutPath: stdoutEntries.at(-1),
    stderrPath: stderrEntries.at(-1),
  };
}

function globOutputCandidates(outputDir: string, prefix: string, suffix: string): string[] {
  try {
    return readdirSync(outputDir)
      .filter(name => name.startsWith(prefix) && name.endsWith(suffix))
      .map(name => resolve(outputDir, name));
  } catch {
    return [];
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
  const commandsToRun = validationCommands.slice(0, MAX_VERIFICATION_COMMANDS);
  const results: VerificationCommandResult[] = [];
  let overallOk = true;
  let hasSystemError = false;

  for (const cmd of commandsToRun) {
    // Risk assessment: block critical commands, flag high-risk
    const risk = assessCommandRisk(cmd);
    if (risk.level === 'critical') {
      logger.warn(`验证命令被安全策略阻断 (critical): ${cmd} — ${risk.reason || ''}`);
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }

    const parts = splitCommandArgs(cmd);
    if (parts.length === 0) {
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }
    const [executable, ...args] = parts;
    const startMs = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
        timeout: verificationTimeout,
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
      const execError = error as any;
      
      const stdoutStr = execError.stdout?.toString?.() || '';
      const stderrStr = execError.stderr?.toString?.() || '';
      const exitCode: number | null = execError.killed ? null : (execError.status ?? execError.code ?? null);
      const isSystem = ['ENOENT', 'EACCES', 'EPERM'].includes(execError.code)
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
  const compacted = compactAgentOutput(result.output);
  const jsonResult: RunTaskJsonResult = {
    ok: result.success,
    command: result.command,
    output: compacted.output,
    outputTruncated: compacted.truncated,
  };
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
  if (result.error) {
    jsonResult.error = {
      code: result.error.code,
      message: result.error.message,
    };
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
      agentTaskContract = await buildAgentTaskContract({
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
        commandGenerationPath: undefined,
        fallbackUsed: false,
        agentTaskContract: agentTaskContractSummary,
      };
    }

    if (!tool) {
      throw new Error('缺少 Agent CLI 工具名称，请传入 --tool <name>');
    }
    const knownAgentDescriptor = getAgentDescriptorById(tool);
    const knownAgentAdapter = getAgentAdapterById(tool);

    if (dryRun) {
      const dryRunPrompt = buildDryRunPrompt(taskId, label, agentTaskContractSummary);
      const dryRunGenerated = knownAgentDescriptor && knownAgentAdapter
        ? knownAgentAdapter.render({
          descriptor: knownAgentDescriptor,
          workspaceRoot: process.cwd(),
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
      logger.info(`[dry-run] 将预览: ${dryRunCommand}`);
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
        workspaceRoot: process.cwd(),
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
      agentTaskContractSummary.instructionHash = computeInstructionHash(
        taskId,
        label,
        agentTaskContract.docExcerpt || '',
        tool,
        agentTaskContract.allowedFiles,
        agentTaskContract.forbiddenFiles,
        globalConfigDigest,
      );
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
        model: llmConfig.model,
        temperature: Number.isFinite(llmTemperature) ? llmTemperature : 0.1,
      });
      agentTaskContractSummary.globalConfigDigest = globalConfigDigest;
      agentTaskContractSummary.instructionHash = computeInstructionHash(
        taskId,
        label,
        agentTaskContract.docExcerpt || '',
        tool,
        agentTaskContract.allowedFiles,
        agentTaskContract.forbiddenFiles,
        globalConfigDigest,
      );

      const cacheManager = getToolCacheManager();
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
    }

    const fullCommand = buildCommandString(generated.command, generated.args);
    if (commandGenerationPath === 'llm-fallback') {
      const invocationValidation = validateGeneratedInvocation(tool, generated);
      if (!invocationValidation.valid) {
        const validationErrorMessage = `${invocationValidation.message}；已阻断执行`;
        logger.error(validationErrorMessage);
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

    const securityManager = getSecurityManager();
    const securitySpan = startSpan('cli.run-task.securityCheck', {
      context: traceContext,
      parentSpanId: rootSpan.spanId,
      source: 'cli',
      attributes: {
        ...baseAttributes,
        commandGenerationPath,
      },
    });
    const detectionResult = securityManager.detectCommand(fullCommand, generated.command);
    await securitySpan.end({
      dangerous: Boolean(detectionResult.isDangerous),
      severity: detectionResult.severity || 'none',
      ruleName: detectionResult.rule?.name || '',
      command: limitText(fullCommand),
      fallbackUsed,
    });
    // Build risk assessment for the main command
    let riskAssessment: RunTaskRiskAssessment | undefined;
    if (detectionResult.isDangerous && detectionResult.severity === 'critical') {
      const ruleName = detectionResult.rule?.name || 'Unknown Rule';
      logger.error(`安全策略拦截: 命令匹配规则 "${ruleName}" (severity: critical)`);
      logger.error(`匹配模式: ${detectionResult.matchedPattern}`);
      audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'BLOCKED', 'run-task');
      return {
        success: false,
        output: `安全策略拦截: ${ruleName}`,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        error: {
          code: 'SECURITY_BLOCKED',
          message: `安全策略拦截: ${ruleName}`,
        },
        agentTaskContract: agentTaskContractSummary,
      };
    }
    if (detectionResult.isDangerous) {
      // high/medium risk: pass risk info to plugin for user confirmation
      riskAssessment = {
        level: detectionResult.severity || 'medium',
        ruleName: detectionResult.rule?.name,
        needsConfirmation: detectionResult.severity === 'high',
      };
      logger.warn(`命令风险评级: ${riskAssessment.level} (${riskAssessment.ruleName || 'unknown'}) — 需插件端确认`);
    }

    audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'EXECUTING', 'run-task');

    let runtimeEnvPatch: Record<string, string> | undefined;
    if (knownAgentDescriptor) {
      try {
        const bootstrapResult = await bootstrapAgentRuntime({
          descriptor: knownAgentDescriptor,
          workspaceRoot: process.cwd(),
        });
        runtimeEnvPatch = bootstrapResult.envPatch;
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error
          ? `Agent runtime bootstrap 失败: ${bootstrapError.message}`
          : 'Agent runtime bootstrap 失败';
        logger.error(message);
        audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'PREFLIGHT_FAILED', 'run-task');
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
        await execFileAsync(generated.command, preflightArgs, {
          timeout: 10000,
          cwd: process.cwd(),
          env: childEnv,
        });
        await preflightSpan.end({ agentAvailable: true });
      } catch (preflightError) {
        const preflightMsg = `Agent CLI "${generated.command}" 未通过${preflightCheckLabel}`;
        const preflightErrorCode = classifyAgentFailureCode(preflightError, preflightMsg);
        await preflightSpan.fail(preflightError, { agentAvailable: false });
        logger.error(preflightMsg);
        audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'PREFLIGHT_FAILED', 'run-task');
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

    logger.info(`执行: ${fullCommand}`);
    if (generated.explanation) {
      logger.info(`说明: ${generated.explanation}`);
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
          timeoutMs: agentCliTimeout,
        },
      });
      const outputDir = getRunTaskOutputDir();
      await mkdir(outputDir, { recursive: true });
      const ts = Date.now();
      const redactedStdoutPath = resolve(outputDir, `${taskId}-${ts}.stdout`);
      const redactedStderrPath = resolve(outputDir, `${taskId}-${ts}.stderr`);

      const child = spawn(generated.command, generated.args, {
        cwd: process.cwd(),
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
      const stdoutRedactedWriter = createWriteStream(redactedStdoutPath, { encoding: 'utf8' });
      const stderrRedactedWriter = createWriteStream(redactedStderrPath, { encoding: 'utf8' });

      let redactedStdout = '';
      let redactedStderr = '';

      // Required pipeline: spawn -> redactor -> writer (file)
      child.stdout?.pipe(stdoutRedactor).pipe(stdoutRedactedWriter);
      child.stderr?.pipe(stderrRedactor).pipe(stderrRedactedWriter);

      stdoutRedactor.on('data', (chunk: Buffer | string) => {
        redactedStdout += chunk.toString();
      });
      stderrRedactor.on('data', (chunk: Buffer | string) => {
        redactedStderr += chunk.toString();
      });

      const streamDrainPromise = Promise.all([
        waitForWriterSettled(stdoutRedactedWriter),
        waitForWriterSettled(stderrRedactedWriter),
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
          stdoutRedactedWriter.off('error', onErr);
          stderrRedactedWriter.off('error', onErr);
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
          }));
        };

        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          const timeoutError = new Error(`Agent CLI timeout after ${agentCliTimeout}ms`);
          (timeoutError as Error & { code?: string; completionSignal?: SpawnCompletionSignal }).code = 'TIMEOUT';
          (timeoutError as Error & { code?: string; completionSignal?: SpawnCompletionSignal }).completionSignal = 'timeout';
          rejectOnce(timeoutError);
        }, agentCliTimeout);
        const onErr = (err: unknown) => {
          rejectOnce(err as Error);
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
          }, agentExitFlushGraceMs);
        };
        const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
          closeObserved = true;
          settleWithExit(code, signal, 'close');
        };

        streamDrainPromise.catch(onErr);
        child.on('error', onErr);
        child.on('exit', onExit);
        child.on('close', onClose);
        stdoutRedactedWriter.on('error', onErr);
        stderrRedactedWriter.on('error', onErr);
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
          verification = await runVerificationCommands(validationCommands, process.cwd());
          await verificationSpan.end({
            verificationOk: verification.ok,
            verificationIsSystemError: !!verification.isSystemError,
            verificationTotalCommands: verification.commands.length,
            verificationPassedCommands: verification.commands.filter(c => c.ok).length,
            verificationFailedCommands: verification.commands.filter(c => !c.ok).length,
            verificationTotalDurationMs: verification.commands.reduce((sum, c) => sum + c.durationMs, 0),
          });
          logger.info(`验证完成: ${verification.ok ? '通过' : '失败'} (${verification.commands.length} 条命令)${verification.isSystemError ? ' [系统错误]' : ''}`);
        } catch (error) {
          verification = { ok: false, commands: [], isSystemError: true };
          await verificationSpan.fail(error);
          logger.error('验证执行异常');
        }
      }

      const finalSuccess = !softSystemFailureMessage
        && agentExecutionOutcome !== 'planned_only'
        && (verification ? (verification.ok && !verification.isSystemError) : true);
      if (softSystemFailureMessage) {
        logger.warn('任务 Agent 输出环境受限，按系统错误处理');
      } else if (!finalSuccess && verification?.ok) {
        logger.warn('任务 Agent 成功但验证发生系统错误');
      } else if (!finalSuccess) {
        logger.warn('任务 Agent 成功但验证失败');
      }

      // Usage is now captured in real-time
      const usage = capturedUsage;
      if (usage) {
        logger.info(`Token 消耗 (实时捕获): prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`);
      }

      audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'COMPLETED', 'run-task');
      logger.info(finalSuccess ? '任务执行成功' : '任务执行完成（验证失败或系统错误）');
      if (gitChanges) {
        logger.info(`变更文件: ${gitChanges.changedFiles.length} 个`);
      }
      return {
        success: finalSuccess,
        output: combinedOutput,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        agentExecutionOutcome,
        error: agentExecutionOutcome === 'planned_only'
          ? { code: 'AGENT_PLANNED_ONLY', message: 'Agent 仅输出计划，未执行实现' }
          : softSystemFailureMessage
            ? { code: 'AGENT_SYSTEM_ERROR', message: softSystemFailureMessage }
          : undefined,
        gitChanges,
        agentTaskContract: agentTaskContractSummary,
        verification,
        usage,
      };
    } catch (error) {
      const execError = error as any;
      const latestOutputFiles = findLatestRunTaskOutputFiles(taskId);
      const fileStdout = latestOutputFiles?.stdoutPath ? await safeReadTextFile(latestOutputFiles.stdoutPath) : '';
      const fileStderr = latestOutputFiles?.stderrPath ? await safeReadTextFile(latestOutputFiles.stderrPath) : '';
      const errStdout = execError.stdout?.toString?.() || fileStdout;
      const errStderr = execError.stderr?.toString?.() || fileStderr;
      const errOutput = errStdout + (errStderr ? '\n' + errStderr : '') || execError.message || String(error);
      const rawErrOutputForUsage = errStdout + (errStderr ? '\n' + errStderr : '');
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
      const completionSignal = (execError?.completionSignal as SpawnCompletionSignal | undefined) || undefined;
      await spawnFailSpan.fail(error, {
        stdoutLength: errStdout.length,
        stderrLength: errStderr.length,
        exitCode: execError.code ?? null,
        completionSignal,
      });
      const gitChanges = await collectGitChanges(gitDiffBefore) ?? undefined;
      audit.securityAction('RUN_TASK', `${tool}:${taskId}`, 'FAILED', 'run-task');
      logger.error(`任务执行失败: ${errOutput}`);
      const errUsage = parseTokenUsage(rawErrOutputForUsage || errOutput);
      const errorCode = classifyAgentFailureCode(execError, errOutput);
      const errorMessage = execError?.message || 'Agent 执行失败';
      return {
        success: false,
        output: errOutput,
        command: fullCommand,
        commandGenerationPath,
        fallbackUsed,
        error: {
          code: errorCode,
          message: errorMessage,
        },
        gitChanges,
        agentTaskContract: agentTaskContractSummary,
        usage: errUsage,
      };
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
        console.log(JSON.stringify({ ok: false, error: { code: 'CLI_ERROR', message } }, null, 2));
      } else {
        logger.error(`执行失败: ${message}`);
      }
      process.exit(1);
    }
  });
