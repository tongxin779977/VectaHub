/**
 * P2-011 Orchestration Recovery — Type Definitions
 *
 * Data contracts for OrchestrationPlan/WorkflowDraft recovery decision model.
 * Extends the existing doc-task recovery model to handle orchestration failures.
 */

import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';
import type { ExecutionRecord } from '../types/workflow.js';
import type { WorkerResult } from '../types/worker-result.js';
import type { OrchestrationVerificationResult } from './verification-result.js';
import type { RecoveryDecisionKind, RecoveryDecisionMode } from './recovery.js';

export type OrchestrationFailureKind =
  | 'plan_validation_error'
  | 'draft_validation_error'
  | 'execution_error'
  | 'worker_error'
  | 'verification_error'
  | 'hash_mismatch'
  | 'unknown';

export type OrchestrationRecoveryDecisionKind =
  | RecoveryDecisionKind
  | 'rerun_task'
  | 'resume_after_manual_fix';

export interface OrchestrationRecoveryDecision {
  kind: OrchestrationRecoveryDecisionKind;
  mode: RecoveryDecisionMode;
  reason: string;
  summary: string;
  suggestedActions: string[];
  needsNewTrace: boolean;
  canReusePreviousCommand: boolean;
}

export interface OrchestrationRecoveryInput {
  planId?: string;
  draftId?: string;
  executionId?: string;
  traceId?: string;
  failureKind: OrchestrationFailureKind;
  failureReason: string;
  planHash?: string;
  currentPlanHash?: string;
  workflowHash?: string;
  currentWorkflowHash?: string;
  plan?: OrchestrationPlan;
  draft?: WorkflowDraft;
  executionRecord?: ExecutionRecord;
  workerResult?: WorkerResult;
  verificationResult?: OrchestrationVerificationResult;
  hasSideEffects: boolean;
  stepsCompleted: number;
  stepsFailed: number;
  totalSteps: number;
}

export interface OrchestrationRecoveryRecord {
  recoveryRunId: string;
  sourcePlanId?: string;
  sourceDraftId?: string;
  sourceExecutionId?: string;
  planId?: string;
  draftId?: string;
  executionId?: string;
  decision: OrchestrationRecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
  status: 'planned' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface RecoveryContext {
  planId?: string;
  draftId?: string;
  executionId?: string;
  traceId?: string;
  cwd: string;
  originalPlanHash?: string;
  originalWorkflowHash?: string;
  failureContext: {
    kind: OrchestrationFailureKind;
    reason: string;
    failedStepId?: string;
    errorMessage?: string;
  };
  traceValid: boolean;
  hashValid: boolean;
  canResume: boolean;
}

export function buildRecoveryContext(input: OrchestrationRecoveryInput): RecoveryContext {
  const hashValid = checkHashValidity(input);
  const traceValid = checkTraceValidity(input);

  const canResume = determineCanResume(input, hashValid, traceValid);

  return {
    planId: input.planId,
    draftId: input.draftId,
    executionId: input.executionId,
    traceId: input.traceId,
    cwd: input.plan?.metadata.cwd ?? input.draft?.metadata.cwd ?? '',
    originalPlanHash: input.planHash,
    originalWorkflowHash: input.workflowHash,
    failureContext: {
      kind: input.failureKind,
      reason: input.failureReason,
      failedStepId: extractFailedStepId(input),
      errorMessage: extractErrorMessage(input),
    },
    traceValid,
    hashValid,
    canResume,
  };
}

function checkHashValidity(input: OrchestrationRecoveryInput): boolean {
  if (input.planHash && input.currentPlanHash) {
    return input.planHash === input.currentPlanHash;
  }
  if (input.workflowHash && input.currentWorkflowHash) {
    return input.workflowHash === input.currentWorkflowHash;
  }
  return true;
}

function checkTraceValidity(input: OrchestrationRecoveryInput): boolean {
  if (input.traceId && input.executionRecord?.traceId) {
    return input.traceId === input.executionRecord.traceId;
  }
  return input.traceId !== undefined;
}

function determineCanResume(
  input: OrchestrationRecoveryInput,
  hashValid: boolean,
  traceValid: boolean
): boolean {
  if (!hashValid || !traceValid) {
    return false;
  }
  if (input.hasSideEffects && input.stepsCompleted === 0) {
    return false;
  }
  if (input.failureKind === 'plan_validation_error' || input.failureKind === 'draft_validation_error') {
    return false;
  }
  return input.stepsFailed < input.totalSteps;
}

function extractFailedStepId(input: OrchestrationRecoveryInput): string | undefined {
  if (input.executionRecord?.steps) {
    const failedStep = input.executionRecord.steps.find(
      (s) => s.status === 'FAILED' || s.status === 'TIMEOUT' || s.status === 'ABORTED'
    );
    return failedStep?.stepId;
  }
  return undefined;
}

function extractErrorMessage(input: OrchestrationRecoveryInput): string | undefined {
  if (input.workerResult?.failureReason) {
    return input.workerResult.failureReason;
  }
  if (input.verificationResult?.failureReason) {
    return input.verificationResult.failureReason;
  }
  if (input.executionRecord?.steps) {
    const failedStep = input.executionRecord.steps.find(
      (s) => s.status === 'FAILED' || s.status === 'TIMEOUT' || s.status === 'ABORTED'
    );
    return failedStep?.error;
  }
  return input.failureReason;
}

export function decideOrchestrationRecovery(input: OrchestrationRecoveryInput): OrchestrationRecoveryDecision {
  try {
    return decideOrchestrationRecoveryInner(input);
  } catch {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'recovery-decision-error',
      summary: '编排恢复决策异常，请人工检查状态。',
      suggestedActions: ['检查 plan/draft 执行记录', '手动确认恢复策略'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }
}

function decideOrchestrationRecoveryInner(input: OrchestrationRecoveryInput): OrchestrationRecoveryDecision {
  const context = buildRecoveryContext(input);

  if (!context.hashValid) {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'hash-mismatch',
      summary: 'Plan 或 Workflow 定义已变化，禁止基于过期上下文恢复。',
      suggestedActions: ['重新生成 OrchestrationPlan', '重新确认 WorkflowDraft'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  if (input.failureKind === 'plan_validation_error' || input.failureKind === 'draft_validation_error') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'validation-error',
      summary: 'Plan 或 Draft 结构校验失败，需要修复后再执行。',
      suggestedActions: ['检查 plan/draft 结构', '修复校验错误后重新生成'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  if (input.failureKind === 'verification_error' && input.verificationResult?.status === 'fail') {
    if (input.hasSideEffects && input.stepsCompleted > 0) {
      return {
        kind: 'suggest_fix',
        mode: 'confirm_required',
        reason: 'verification-failed-with-changes',
        summary: '验证失败且存在副作用，建议基于失败上下文修复。',
        suggestedActions: [
          '检查验证失败原因',
          '审查已执行步骤的输出',
          '确认后基于失败摘要修复',
        ],
        needsNewTrace: true,
        canReusePreviousCommand: false,
      };
    }
    return {
      kind: 'retry_direct',
      mode: 'confirm_required',
      reason: 'verification-failed-no-side-effects',
      summary: '验证失败但无副作用，建议直接重试。',
      suggestedActions: ['确认后重新执行验证'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    };
  }

  if (input.failureKind === 'worker_error') {
    if (input.workerResult?.status === 'success') {
      return {
        kind: 'retry_direct',
        mode: 'confirm_required',
        reason: 'worker-verification-mismatch',
        summary: 'Worker 自报成功但验证失败，建议直接重试验证。',
        suggestedActions: ['确认后重新执行验证'],
        needsNewTrace: true,
        canReusePreviousCommand: true,
      };
    }
    if (input.hasSideEffects && input.stepsCompleted > 0) {
      return {
        kind: 'suggest_fix',
        mode: 'confirm_required',
        reason: 'worker-failed-with-changes',
        summary: 'Worker 执行失败且存在副作用，建议基于失败上下文修复。',
        suggestedActions: [
          '检查 Worker 输出',
          '审查已执行步骤的输出',
          '确认后基于失败摘要修复',
        ],
        needsNewTrace: true,
        canReusePreviousCommand: false,
      };
    }
    return {
      kind: 'retry_direct',
      mode: 'confirm_required',
      reason: 'worker-failed-no-side-effects',
      summary: 'Worker 执行失败但无副作用，建议直接重试。',
      suggestedActions: ['确认后重新执行任务'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    };
  }

  if (input.failureKind === 'execution_error') {
    if (!context.canResume) {
      return {
        kind: 'suggest_fix',
        mode: 'confirm_required',
        reason: 'execution-failed-not-resumable',
        summary: '执行失败且无法从当前状态恢复，建议基于失败上下文修复。',
        suggestedActions: [
          '检查失败步骤和错误',
          '确认后基于失败摘要修复',
        ],
        needsNewTrace: true,
        canReusePreviousCommand: false,
      };
    }
    if (input.hasSideEffects) {
      return {
        kind: 'resume_after_manual_fix',
        mode: 'confirm_required',
        reason: 'execution-failed-resumable-with-changes',
        summary: '执行失败但可从断点恢复，需确认已执行的副作用可接受。',
        suggestedActions: [
          '审查已执行步骤的副作用',
          '确认后可从断点继续执行',
        ],
        needsNewTrace: true,
        canReusePreviousCommand: false,
      };
    }
    return {
      kind: 'rerun_task',
      mode: 'confirm_required',
      reason: 'execution-failed-resumable',
      summary: '执行失败但可重新执行，建议重新运行任务。',
      suggestedActions: ['确认后重新执行任务'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    };
  }

  if (input.failureKind === 'hash_mismatch') {
    return {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'hash-changed',
      summary: 'Plan 或 Workflow 定义已变化，禁止基于过期上下文恢复。',
      suggestedActions: ['重新生成 OrchestrationPlan', '重新确认 WorkflowDraft'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    };
  }

  return {
    kind: 'blocked',
    mode: 'manual_only',
    reason: 'unknown-failure',
    summary: '编排失败原因未知，请人工检查状态。',
    suggestedActions: ['检查 plan/draft 执行记录', '手动确认恢复策略'],
    needsNewTrace: false,
    canReusePreviousCommand: false,
  };
}

export function createOrchestrationRecoveryRecord(input: {
  recoveryRunId: string;
  sourcePlanId?: string;
  sourceDraftId?: string;
  sourceExecutionId?: string;
  planId?: string;
  draftId?: string;
  executionId?: string;
  decision: OrchestrationRecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
}): OrchestrationRecoveryRecord {
  const now = new Date().toISOString();
  return {
    recoveryRunId: input.recoveryRunId,
    sourcePlanId: input.sourcePlanId,
    sourceDraftId: input.sourceDraftId,
    sourceExecutionId: input.sourceExecutionId,
    planId: input.planId,
    draftId: input.draftId,
    executionId: input.executionId,
    decision: input.decision,
    sourceTraceId: input.sourceTraceId,
    recoveryTraceId: input.recoveryTraceId,
    status: 'planned',
    startedAt: now,
    updatedAt: now,
  };
}

export function classifyOrchestrationFailure(
  planValidationError?: { message: string },
  draftValidationError?: { message: string },
  executionRecord?: ExecutionRecord,
  workerResult?: WorkerResult,
  verificationResult?: OrchestrationVerificationResult
): OrchestrationFailureKind {
  if (planValidationError) {
    return 'plan_validation_error';
  }

  if (draftValidationError) {
    return 'draft_validation_error';
  }

  if (verificationResult && verificationResult.status === 'fail') {
    return 'verification_error';
  }

  if (workerResult && workerResult.status !== 'success') {
    return 'worker_error';
  }

  if (executionRecord) {
    const hasFailedStep = executionRecord.steps.some(
      (s) => s.status === 'FAILED' || s.status === 'TIMEOUT' || s.status === 'ABORTED'
    );
    if (hasFailedStep) {
      return 'execution_error';
    }
  }

  return 'unknown';
}

export function classifyExecutionFailure(executionRecord: ExecutionRecord): {
  kind: OrchestrationFailureKind;
  reason: string;
  failedStepId?: string;
} {
  const failedStep = executionRecord.steps.find(
    (s) => s.status === 'FAILED' || s.status === 'TIMEOUT' || s.status === 'ABORTED'
  );

  if (!failedStep) {
    return { kind: 'unknown', reason: 'Unknown execution failure' };
  }

  const reason = failedStep.error ?? `Step ${failedStep.stepId} ended with status ${failedStep.status}`;

  switch (failedStep.status) {
    case 'TIMEOUT':
      return { kind: 'execution_error', reason: `Timeout: ${reason}`, failedStepId: failedStep.stepId };
    case 'ABORTED':
      return { kind: 'execution_error', reason: `Aborted: ${reason}`, failedStepId: failedStep.stepId };
    case 'FAILED':
    default:
      return { kind: 'execution_error', reason, failedStepId: failedStep.stepId };
  }
}

export function classifyWorkerFailure(workerResult: WorkerResult): {
  kind: OrchestrationFailureKind;
  reason: string;
} {
  if (workerResult.status === 'cancelled') {
    return { kind: 'worker_error', reason: 'Worker was cancelled' };
  }
  if (workerResult.status === 'needs_review') {
    return { kind: 'worker_error', reason: 'Worker result needs review' };
  }
  if (workerResult.status === 'failure') {
    return {
      kind: 'worker_error',
      reason: workerResult.failureReason ?? 'Worker execution failed',
    };
  }
  return { kind: 'unknown', reason: 'Unknown worker status' };
}
