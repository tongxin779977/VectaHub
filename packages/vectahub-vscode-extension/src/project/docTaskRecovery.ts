/**
 * P6 Self-Healing & Recovery — Plugin-side Recovery Module
 *
 * Provides deterministic recovery decision logic for doc-task failures.
 * Builds recovery input from DocTaskRunRecord and creates recovery records.
 *
 * See docs/v2/self-healing-recovery-spec.md §9.1.
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
  agentTaskContract?: {
    boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
    allowedFileCount: number;
    forbiddenFileCount: number;
    validationCommandCount: number;
    executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  };
}

// ─── Recovery Decision ───────────────────────────────────────────────────────

export type RecoveryDecisionKind =
  | 'retry_direct'
  | 'rerun_task'
  | 'resume_after_manual_fix'
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

// ─── Build Recovery Input ────────────────────────────────────────────────────

/**
 * Build a DocTaskRecoveryInput from a DocTaskRunRecord.
 * Strips sensitive data — only summary fields are included.
 */
export function buildRecoveryInput(record: DocTaskRunRecord): DocTaskRecoveryInput {
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

function decideRecoveryInner(input: DocTaskRecoveryInput): RecoveryDecision {
  const { failureKind, gitChanges, verification } = input;
  const hasGitChanges = (gitChanges?.changedFileCount ?? 0) > 0;
  const hasVerification = verification !== undefined && verification !== null;

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