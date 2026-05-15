/**
 * P6 Self-Healing & Recovery — Type Definitions
 *
 * Data contracts for doc-task recovery decision model.
 * See docs/specs/recovery-loop.md.
 */

import type { DocTaskFailureKind, DocTaskRunStatus } from './doc-task.js';

// ─── 6.1 Recovery Input ─────────────────────────────────────────────────────

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
  /** Hash of the task instruction at the time of the failed run. */
  previousInstructionHash?: string;
  /** Hash of the current task instruction (computed at recovery time). */
  currentInstructionHash?: string;
}

// ─── 6.2 Recovery Decision ───────────────────────────────────────────────────

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

// ─── 6.3 Recovery Record ─────────────────────────────────────────────────────

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

// ─── 7. Deterministic Recovery Decision Matrix ───────────────────────────────

/**
 * Deterministic recovery decision pure function.
 * Implements spec §7.1–§7.5. No LLM involved.
 * Performance target: < 2ms per invocation.
 */
export function decideRecovery(input: DocTaskRecoveryInput): RecoveryDecision {
  try {
    return decideRecoveryInner(input);
  } catch {
    // §14: When the triage function itself fails, degrade to blocked/manual_only.
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
  // ── §7.5 instructionHash 变化检测 ──
  // If both hashes are present and they differ, the task definition has changed
  // since the original failure. The old failure context is stale; block recovery.
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

  const { failureKind, gitChanges, verification } = input;
  const hasGitChanges = (gitChanges?.changedFileCount ?? 0) > 0;
  const hasVerification = verification !== undefined && verification !== null;

  // ── §7.4 必须人工处理类 ──

  // §7.1 config → blocked/manual_only
  if (failureKind === 'config') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'config-failure',
      summary: '先修复环境或配置，再重新执行任务。',
      suggestedActions: [
        '检查 LLM 配置是否完整',
        '检查 Agent CLI 是否已安装并授权',
        '确认文档路径是否存在且可读',
      ],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  // conflict → blocked/manual_only
  if (failureKind === 'conflict') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'conflict-detected',
      summary: '检测到代码冲突，必须人工处理后再恢复。',
      suggestedActions: [
        '检查 Git 冲突标记',
        '手动解决冲突后重新执行任务',
      ],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  // system_internal → blocked/manual_only
  if (failureKind === 'system_internal') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'system-internal-error',
      summary: '系统内部错误，需要人工检查运行环境。',
      suggestedActions: [
        '检查 IO / 磁盘空间',
        '检查验证工具是否可用',
        '重试前确认系统状态正常',
      ],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  // cancelled → blocked/manual_only (cancelled is not recoverable automatically)
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

  // ── §7.2 可直接重试类 ──

  // timeout + 无 gitChanges + 无 verification → retry_direct
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

  // json_protocol + 无 gitChanges → retry_direct
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

  // ── §7.3 可建议修复类 ──

  // test → suggest_fix
  if (failureKind === 'test') {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'verification-failed',
      summary: '任务 Agent 成功但验证失败，建议基于失败上下文生成修复任务。',
      suggestedActions: [
        '检查验证失败的命令和输出',
        '确认后基于失败摘要生成修复任务',
      ],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // agent + 有 gitChanges → suggest_fix
  if (failureKind === 'agent' && hasGitChanges) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'agent-failure-with-changes',
      summary: 'Agent 执行失败但已有代码变更，建议基于失败上下文生成修复任务。',
      suggestedActions: [
        '检查已变更文件',
        '确认后基于失败摘要生成修复任务',
      ],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // unknown → suggest_fix (conservative)
  if (failureKind === 'unknown') {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'unknown-failure',
      summary: '任务失败原因未知，建议人工确认后决定恢复策略。',
      suggestedActions: [
        '检查任务运行记录和错误摘要',
        '确认后决定是否重试或人工修复',
      ],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // agent + 无 gitChanges → retry_direct (Agent failed but no side effects)
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

  // timeout + 有 gitChanges → suggest_fix
  if (failureKind === 'timeout' && hasGitChanges) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'timeout-with-changes',
      summary: '任务超时但已产生代码变更，建议检查变更后决定恢复策略。',
      suggestedActions: [
        '检查已变更文件',
        '确认后决定是否基于变更继续修复',
      ],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // json_protocol + 有 gitChanges → suggest_fix
  if (failureKind === 'json_protocol' && hasGitChanges) {
    return {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'json-protocol-with-changes',
      summary: '输出协议异常但已产生代码变更，建议检查变更后决定恢复策略。',
      suggestedActions: [
        '检查已变更文件',
        '确认后决定是否基于变更继续修复',
      ],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    };
  }

  // Fallback: anything unmatched → blocked
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a DocTaskRecoveryInput from a run record.
 * Strips sensitive data (full stdout/stderr/env/secret/prompt).
 */
export function buildRecoveryInputFromRecord(record: {
  runId: string;
  taskId: string;
  taskLabel: string;
  docPath?: string;
  traceId?: string;
  status: DocTaskRunStatus;
  failureKind?: DocTaskFailureKind;
  command?: string;
  errorMessage?: string;
  outputSummary?: string;
  instructionHash?: string;
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
    allowedFiles: string[];
    forbiddenFiles: string[];
    validationCommands: string[];
    executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  };
}, currentInstructionHash?: string): DocTaskRecoveryInput {
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
    previousInstructionHash: record.instructionHash,
    currentInstructionHash,
    agentTaskContract: record.agentTaskContract
      ? {
          boundaryConfidence: record.agentTaskContract.boundaryConfidence,
          allowedFileCount: record.agentTaskContract.allowedFiles?.length ?? 0,
          forbiddenFileCount: record.agentTaskContract.forbiddenFiles?.length ?? 0,
          validationCommandCount: record.agentTaskContract.validationCommands?.length ?? 0,
          executionMode: record.agentTaskContract.executionMode,
        }
      : undefined,
  };
}

/**
 * Create a new DocTaskRecoveryRecord.
 */
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
