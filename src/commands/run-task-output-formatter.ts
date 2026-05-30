import type { AgentTaskContract, DocTaskFailureKind, DocTaskRunStatus } from '../types/doc-task.js';
import {
  RunTaskResult,
  AgentTaskContractSummary,
  VerificationResult,
  RunTaskRiskAssessment,
  RunTaskRecoveryDecisionSummary,
  RunTaskReviewReport,
  getMaxJsonOutputLength,
  TRUNCATED_OUTPUT_MARKER,
  getContext,
  VERIFICATION_SUMMARY_MAX_LENGTH,
  FAILURE_HUMAN_SUMMARY_MAX_LENGTH
} from './run-task-shared.js';
import { createRunTaskReviewReport } from './run-task-review.js';
import { NOISY_OUTPUT_PATTERNS } from './run-task-logger.js';
import type { RunTaskReviewFinding } from './run-task-review.js';
import { RunTaskReviewStatus } from './run-task-review.js';
import { decideRecovery } from '../types/recovery.js';
import { getSecurityGuard } from '../security-protocol/index.js';

export interface RunTaskHumanOutputOptions {
  mode?: 'default' | 'contract-preview' | 'dry-run';
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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  failureKind?: DocTaskFailureKind;
  unclosedExecution?: boolean;
  completionSignal?: string;
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

function compactAgentOutput(output: string): { output: string; truncated: boolean } {
  const cleanedLines = output
    .split(/\r?\n/)
    .map((line: string) => line.trimEnd())
    .filter((line: string) => line.trim())
    .filter((line: string) => !NOISY_OUTPUT_PATTERNS.some((pattern: RegExp) => pattern.test(line)));

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

export function buildUserVisibleSummary(output: string): { output: string; truncated: boolean } {
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

  const statusText: Record<string, string> = {
    [RunTaskReviewStatus.PASS]: '通过',
    [RunTaskReviewStatus.NEEDS_REVIEW]: '需复核',
    [RunTaskReviewStatus.FAIL]: '未通过',
  };
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

  lines.push('', '说明：完整 stdout/stderr 已写入失败日志，控制台只显示摘要。');

  return lines.join('\n');
}

function formatVerificationCommandsForHuman(verification?: VerificationResult, contract?: AgentTaskContractSummary): string[] {
  if (verification?.commands.length) {
    return verification.commands.map((command: { ok: boolean; command: string }) => {
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
      '建议验证命令：',
      formatHumanList(contract.validationCommands, 'npm run typecheck'),
      '',
      `命令生成路径：${result.commandGenerationPath || 'unknown'}`,
      `Fallback：${result.fallbackUsed ? 'yes' : 'no'}`,
    ];

    if (result.error) {
      lines.push('', `错误：${result.error.message}`);
    }

    return lines.join('\n');
  }

  if (!result.success) {
    return formatRunTaskFailureHumanOutput(result);
  }

  return formatRunTaskSuccessHumanOutput(result);
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
  if (result.reviewReport) {
    jsonResult.reviewReport = result.reviewReport;
  }
  if (result.warning) {
    jsonResult.warning = result.warning;
  }
  if (result.llmReview) {
    jsonResult.llmReview = result.llmReview;
  }

  return jsonResult;
}

export function buildTaskRuntimeFeatures(
  contract: AgentTaskContract,
  contractSummary: AgentTaskContractSummary,
): Record<string, unknown> {
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
    modifiesTests: allowed.some((f: string) => /\.test\./.test(f) || /\.spec\./.test(f)),
    requiresReadableAndJsonOutput: false,
    requiresAsyncProcessTimeoutTests: false,
    hasCliRegistration: allowed.some((f: string) => /cli[-.]?[jt]s$/.test(f)),
    changesPublicContract: allowed.some((f: string) => /\/types\//.test(f) || /index\.[jt]s$/.test(f)),
    changesRuntimeBehavior: allowed.length > 2,
    changesPersistence: false,
    changesSecurityOrSandbox: false,
    mustReuseForbiddenFileLogic: contractSummary.forbiddenFiles.length > 0,
    hasStopIfBroadRefactorNote: /\bbroad\s*refactor\b/i.test(contract.notes?.join(' ') ?? ''),
    isDocsOnly: allowed.length > 0 && allowed.every((f: string) => /\.md$/i.test(f)),
    isContractOnly: allowed.length > 0 && allowed.every((f: string) => /\/types\//.test(f) || /contract/i.test(f)),
    isSinglePureFunction: allowed.length === 1,
    noRuntimeBehaviorChange: false,
  };
}

function truncateVerificationSummary(value: string | undefined): string | undefined {
  if (!value || value.length <= VERIFICATION_SUMMARY_MAX_LENGTH) return value;
  const suffix = '...';
  return `${value.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH - suffix.length)}${suffix}`;
}

import type { SecurityGuard, CommandIntention, SecurityContext } from '../types/security.js';

// ... existing code ...

export async function runVerificationCommands(
  validationCommands: string[],
  cwd: string,
  context?: ReturnType<typeof getContext>,
): Promise<VerificationResult> {
  const resolvedContext = context ?? getContext();
  const guard: SecurityGuard = getSecurityGuard();
  const securityContext: SecurityContext = {
    cwd,
    sessionId: 'verification-session',
  };
  const commandsToRun = validationCommands.slice(0, 10);
  const results: Array<{
    command: string;
    ok: boolean;
    exitCode: number | null;
    durationMs: number;
    stdoutSummary?: string;
    stderrSummary?: string;
    outputTruncated?: boolean;
  }> = [];
  let overallOk = true;
  let hasSystemError = false;

  for (const cmd of commandsToRun) {
    const intention: CommandIntention = { rawCommand: cmd };
    const decision = await guard.assess(intention, securityContext);

    if (decision.decision === 'BLOCKED') {
      resolvedContext.logger.getLogger('run-task').warn(`验证命令被安全策略阻断 (critical): ${cmd} — ${decision.reason || ''}`);
      results.push({ command: cmd, ok: false, exitCode: null, durationMs: 0 });
      overallOk = false;
      continue;
    }

    if (decision.decision === 'REQUIRES_CONFIRMATION') {
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
      const execError = error as {
        stdout?: unknown;
        stderr?: unknown;
        status?: unknown;
        code?: unknown;
        killed?: boolean;
      };

      const stdoutStr = (execError.stdout as { toString?: () => string })?.toString?.() || '';
      const stderrStr = (execError.stderr as { toString?: () => string })?.toString?.() || '';
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

function summarizeRecoveryDecision(decision: { kind: string; mode: string; summary: string }): RunTaskRecoveryDecisionSummary {
  return {
    kind: decision.kind,
    mode: decision.mode,
    summary: decision.summary,
  };
}

function failureKindToStatus(kind: DocTaskFailureKind): DocTaskRunStatus {
  const map: Record<DocTaskFailureKind, DocTaskRunStatus> = {
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

export function buildRecoveryDecisionSummary(input: {
  failureKind?: DocTaskFailureKind;
  gitChanges?: { changedFiles: string[]; shortStat?: string };
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

export function inferExecutionFailureKind(input: {
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

export function didRunTaskValidationPass(
  verification: VerificationResult | undefined,
  contract: AgentTaskContractSummary,
): boolean {
  if (contract.validationCommands.length === 0) {
    return true;
  }
  return !!verification && verification.ok && !verification.isSystemError;
}

export function buildRunTaskReviewReport(input: {
  taskId: string;
  taskLabel: string;
  contract?: AgentTaskContractSummary;
  gitChanges?: { changedFiles: string[]; shortStat?: string };
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
