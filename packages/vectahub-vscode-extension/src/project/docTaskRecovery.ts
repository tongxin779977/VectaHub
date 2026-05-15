/**
 * P6 Self-Healing & Recovery — Plugin-side Recovery Module
 *
 * Provides deterministic recovery decision logic for doc-task failures.
 * Builds recovery input from DocTaskRunRecord and creates recovery records.
 *
 * See docs/specs/recovery-loop.md.
 */

import type { DocTaskFailureKind, DocTaskRunStatus } from './docTaskState.js';
import type { DocTaskRunRecord } from './docTaskRunStore.js';

// ─── Recovery Input ──────────────────────────────────────────────────────────

export interface DocTaskRecoveryInput {
  runId: string;
  taskId: string;
  taskLabel: string;
  docPath?: string;
  traceId?: string;
  failureKind: DocTaskFailureKind;
  status: DocTaskRunStatus;
  command?: string;
  errorMessage?: string;
  outputSummary?: string;
  gitChanges?: {
    changedFileCount: number;
    changedFiles: string[];
    shortStat?: string;
  };
  verification?: {
    ok: boolean;
    totalCommands: number;
    passedCommands: number;
    failedCommands: number;
    failedCommandSummary?: string;
  };
  confirmationSource?: 'preflight' | 'post-execution';
  unclosedExecution?: boolean;
  agentTaskContract?: {
    boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
    allowedFileCount: number;
    forbiddenFileCount: number;
    validationCommandCount: number;
    executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  };
  /** Hash of the task instruction at the time of the failed run. */
  previousInstructionHash?: string;
  /** Hash of the current task instruction (computed at recovery time). */
  currentInstructionHash?: string;
}

function isUnclosedExecution(input: DocTaskRecoveryInput): boolean {
  if (input.unclosedExecution === true) {
    return true;
  }
  const changedFileCount = input.gitChanges?.changedFileCount ?? 0;
  const hasVerification = input.verification !== undefined && input.verification !== null;
  return changedFileCount > 0 && !hasVerification;
}

// ─── Recovery Decision ───────────────────────────────────────────────────────

export type RecoveryDecisionKind =
  | 'retry_direct'
  | 'suggest_fix'
  | 'blocked';

export type RecoveryDecisionMode =
  | 'auto'
  | 'confirm_required'
  | 'manual_only';

export interface RecoveryDecision {
  kind: RecoveryDecisionKind;
  mode: RecoveryDecisionMode;
  reason: string;
  summary: string;
  suggestedActions: string[];
  needsNewTrace: boolean;
  canReusePreviousCommand: boolean;
}

// ─── Recovery Record ─────────────────────────────────────────────────────────

export interface DocTaskRecoveryRecord {
  recoveryRunId: string;
  sourceRunId: string;
  taskId: string;
  decision: RecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
  status: 'planned' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  retryOfRunId?: string;
}

export interface RecoveryExecutionSummary {
  ok?: boolean;
  status?: string;
  failureKind?: string;
  runResult?: {
    ok?: boolean;
    output?: string;
    verification?: {
      ok: boolean;
      isSystemError?: boolean;
    };
  };
  error?: string;
}

export interface RecoveryOutcomeClassification {
  status: DocTaskRunStatus;
  failureKind?: DocTaskFailureKind;
}

// ─── Build Recovery Input ────────────────────────────────────────────────────

/**
 * Build a DocTaskRecoveryInput from a DocTaskRunRecord.
 * Strips sensitive data — only summary fields are included.
 */
export function buildRecoveryInput(record: DocTaskRunRecord, currentInstructionHash?: string): DocTaskRecoveryInput {
  return {
    runId: record.runId,
    taskId: record.taskId,
    taskLabel: record.taskLabel,
    docPath: record.docPath,
    traceId: record.traceId,
    failureKind: record.failureKind ?? 'unknown',
    status: record.status,
    command: record.command,
    errorMessage: record.errorMessage,
    outputSummary: record.outputSummary,
    gitChanges: record.gitChanges,
    verification: record.verification,
    confirmationSource: record.confirmationSource,
    unclosedExecution: record.unclosedExecution,
    previousInstructionHash: record.instructionHash,
    currentInstructionHash,
    agentTaskContract: record.agentTaskContract
      ? {
          boundaryConfidence: record.agentTaskContract.boundaryConfidence,
          allowedFileCount: record.agentTaskContract.allowedFileCount ?? 0,
          forbiddenFileCount: record.agentTaskContract.forbiddenFileCount ?? 0,
          validationCommandCount: record.agentTaskContract.validationCommandCount ?? 0,
          executionMode: record.agentTaskContract.executionMode,
        }
      : undefined,
  };
}

// ─── Deterministic Recovery Decision ─────────────────────────────────────────

/**
 * Deterministic recovery decision pure function.
 * Mirrors src/types/recovery.ts decideRecovery exactly.
 * No LLM involved. Performance target: < 2ms.
 */
export function decideRecovery(input: DocTaskRecoveryInput): RecoveryDecision {
  try {
    return decideRecoveryInner(input);
  } catch {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'recovery-decision-error',
      summary: '恢复决策异常，请人工检查任务状态。',
      suggestedActions: ['检查任务运行记录', '手动确认是否需要重试'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }
}

export function decideRecoveryWithHashGuard(input: DocTaskRecoveryInput): RecoveryDecision {
  if (input.previousInstructionHash !== undefined && input.currentInstructionHash === undefined) {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'instruction-hash-unavailable',
      summary: '无法确认当前任务定义是否变化，已保守阻断恢复以避免使用过期上下文。',
      suggestedActions: ['确认文档可读且边界可预推导', '重新解析文档后再重试恢复'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }
  return decideRecovery(input);
}

function decideRecoveryInner(input: DocTaskRecoveryInput): RecoveryDecision {
  // ── §7.5 instructionHash 变化检测 ──
  if (
    input.currentInstructionHash !== undefined &&
    input.previousInstructionHash !== undefined &&
    input.currentInstructionHash !== input.previousInstructionHash
  ) {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'instruction-changed',
      summary: '任务定义已变化，旧失败记录不再对应当前任务，禁止基于过期上下文恢复。',
      suggestedActions: ['重新解析文档', '重新执行任务'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  const { failureKind, gitChanges, verification, confirmationSource } = input;
  const hasGitChanges = (gitChanges?.changedFileCount ?? 0) > 0;
  const hasVerification = verification !== undefined && verification !== null;
  const unclosedExecution = isUnclosedExecution(input);

  if (confirmationSource === 'preflight') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'confirmation-required-preflight',
      summary: '该任务在执行前确认阶段被阻断，请先完成人工确认后再继续。',
      suggestedActions: ['人工确认风险命令后重新执行任务'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  if (confirmationSource === 'post-execution') {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'confirmation-required-post-execution',
      summary: '该任务已产生代码修改并触发执行后确认，请先确认副作用再决定后续修复。',
      suggestedActions: ['检查已变更文件', '人工确认后决定是否继续修复'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  if (unclosedExecution) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'unclosed-execution',
      summary: '任务存在未收口执行：已有代码修改但未完成验证，需确认后继续修复。',
      suggestedActions: ['检查已变更文件', '人工确认后基于当前变更继续修复'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // §7.4 blocked categories
  if (failureKind === 'config') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'config-failure',
      summary: '先修复环境或配置，再重新执行任务。',
      suggestedActions: ['检查 LLM 配置是否完整', '检查 Agent CLI 是否已安装并授权', '确认文档路径是否存在且可读'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'conflict') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'conflict-detected',
      summary: '检测到代码冲突，必须人工处理后再恢复。',
      suggestedActions: ['检查 Git 冲突标记', '手动解决冲突后重新执行任务'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'system_internal') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'system-internal-error',
      summary: '系统内部错误，需要人工检查运行环境。',
      suggestedActions: ['检查 IO / 磁盘空间', '检查验证工具是否可用', '重试前确认系统状态正常'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'cancelled') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'task-cancelled',
      summary: '任务已被取消，请手动决定是否重新执行。',
      suggestedActions: ['重新运行任务'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  // §7.2 retry_direct
  if (failureKind === 'timeout' && !hasGitChanges && !hasVerification) {
    return {
      kind: 'retry_direct',
      mode: 'confirm_required',
      reason: 'timeout-no-changes',
      summary: '任务超时且未产生代码变更，可能是偶发执行失败，建议直接重试。',
      suggestedActions: ['确认后重新执行任务'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    };
  }

  if (failureKind === 'json_protocol' && !hasGitChanges) {
    return {
      kind: 'retry_direct',
      mode: 'confirm_required',
      reason: 'json-protocol-no-changes',
      summary: 'Agent 输出协议异常且未产生代码变更，建议直接重试。',
      suggestedActions: ['确认后重新执行任务'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    };
  }

  // §7.3 suggest_fix
  if (failureKind === 'test') {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'verification-failed',
      summary: '任务 Agent 成功但验证失败，建议基于失败上下文生成修复任务。',
      suggestedActions: ['检查验证失败的命令和输出', '确认后基于失败摘要生成修复任务'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'agent' && hasGitChanges) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'agent-failure-with-changes',
      summary: 'Agent 执行失败但已有代码变更，建议基于失败上下文生成修复任务。',
      suggestedActions: ['检查已变更文件', '确认后基于失败摘要生成修复任务'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'unknown') {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'unknown-failure',
      summary: '任务失败原因未知，建议人工确认后决定恢复策略。',
      suggestedActions: ['检查任务运行记录和错误摘要', '确认后决定是否重试或人工修复'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'agent' && !hasGitChanges) {
    return {
      kind: 'retry_direct',
      mode: 'confirm_required',
      reason: 'agent-failure-no-changes',
      summary: 'Agent 执行失败且未产生代码变更，建议直接重试。',
      suggestedActions: ['确认后重新执行任务'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    };
  }

  if (failureKind === 'timeout' && hasGitChanges) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'timeout-with-changes',
      summary: '任务超时但已产生代码变更，建议检查变更后决定恢复策略。',
      suggestedActions: ['检查已变更文件', '确认后决定是否基于变更继续修复'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  if (failureKind === 'json_protocol' && hasGitChanges) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'json-protocol-with-changes',
      summary: '输出协议异常但已产生代码变更，建议检查变更后决定恢复策略。',
      suggestedActions: ['检查已变更文件', '确认后决定是否基于变更继续修复'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // Fallback
  return {
    kind: 'blocked',
    mode: 'manual_only',
    reason: 'unmatched-failure',
    summary: '无法自动分类失败原因，请人工检查任务状态。',
    suggestedActions: ['检查任务运行记录', '手动确认恢复策略'],
    needsNewTrace: false,
    canReusePreviousCommand: false,
  };
}

// ─── Create Recovery Record ──────────────────────────────────────────────────

export function createRecoveryRecord(input: {
  recoveryRunId: string;
  sourceRunId: string;
  taskId: string;
  decision: RecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
  retryOfRunId?: string;
}): DocTaskRecoveryRecord {
  const now = new Date().toISOString();
  return {
    recoveryRunId: input.recoveryRunId,
    sourceRunId: input.sourceRunId,
    taskId: input.taskId,
    decision: input.decision,
    sourceTraceId: input.sourceTraceId,
    recoveryTraceId: input.recoveryTraceId,
    status: 'planned',
    startedAt: now,
    updatedAt: now,
    retryOfRunId: input.retryOfRunId,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createRecoveryRunId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if a run record is eligible for recovery.
 * Only failed states are eligible.
 */
export function isRecoveryEligible(status: DocTaskRunStatus): boolean {
  return status.startsWith('failed_') || status === 'cancelled';
}

export function classifyRecoveryOutcome(summary: RecoveryExecutionSummary): RecoveryOutcomeClassification {
  if (summary.runResult?.ok === true || summary.ok === true || summary.status === 'success') {
    return { status: 'success', failureKind: undefined };
  }

  const normalizedKind = normalizeFailureKind(summary.failureKind);
  if (normalizedKind) {
    return {
      status: failureKindToStatus(normalizedKind),
      failureKind: normalizedKind,
    };
  }

  if (summary.runResult?.verification && !summary.runResult.verification.ok) {
    if (summary.runResult.verification.isSystemError) {
      return { status: 'failed_system_internal', failureKind: 'system_internal' };
    }
    return { status: 'failed_test', failureKind: 'test' };
  }

  const mergedText = `${summary.runResult?.output ?? ''}\n${summary.error ?? ''}`.toLowerCase();
  if (mergedText.includes('timeout') || mergedText.includes('timed out') || mergedText.includes('超时')) {
    return { status: 'failed_timeout', failureKind: 'timeout' };
  }
  if (mergedText.includes('json') && mergedText.includes('parse')) {
    return { status: 'failed_json_protocol', failureKind: 'json_protocol' };
  }
  if (mergedText.includes('merge conflict') || mergedText.includes('<<<<<<<') || mergedText.includes('>>>>>>>') || mergedText.includes('冲突')) {
    return { status: 'failed_conflict', failureKind: 'conflict' };
  }
  if (mergedText.includes('permission denied') || mergedText.includes('未配置') || mergedText.includes('no such file') || mergedText.includes('eacces') || mergedText.includes('enoent')) {
    return { status: 'failed_config', failureKind: 'config' };
  }
  if (mergedText.includes('io error') || mergedText.includes('system error') || mergedText.includes('emfile') || mergedText.includes('enfile')) {
    return { status: 'failed_system_internal', failureKind: 'system_internal' };
  }

  return { status: 'failed_agent', failureKind: 'unknown' };
}

function normalizeFailureKind(value?: string): DocTaskFailureKind | undefined {
  const valid: DocTaskFailureKind[] = ['config', 'agent', 'json_protocol', 'timeout', 'test', 'conflict', 'system_internal', 'cancelled', 'unknown'];
  if (!value) return undefined;
  return valid.includes(value as DocTaskFailureKind) ? value as DocTaskFailureKind : undefined;
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
