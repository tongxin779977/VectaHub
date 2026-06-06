import { describe, expect, it } from 'vitest';
import {
  decideOrchestrationRecovery,
  buildRecoveryContext,
  classifyOrchestrationFailure,
  classifyExecutionFailure,
  classifyWorkerFailure,
  createOrchestrationRecoveryRecord,
  type OrchestrationRecoveryInput,
} from './orchestration-recovery.js';

describe('orchestration-recovery', () => {
  describe('classifyOrchestrationFailure', () => {
    it('should classify plan_validation_error', () => {
      const result = classifyOrchestrationFailure(
        { message: 'Invalid plan structure' },
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result).toBe('plan_validation_error');
    });

    it('should classify draft_validation_error', () => {
      const result = classifyOrchestrationFailure(
        undefined,
        { message: 'Invalid draft structure' },
        undefined,
        undefined,
        undefined
      );
      expect(result).toBe('draft_validation_error');
    });

    it('should classify verification_error when verification fails', () => {
      const result = classifyOrchestrationFailure(
        undefined,
        undefined,
        undefined,
        undefined,
        { status: 'fail' as const, commandResults: [], semanticResults: [], allSuccessCriteriaMet: false, planId: 'p1', durationMs: 100, startedAt: '', completedAt: '' }
      );
      expect(result).toBe('verification_error');
    });

    it('should classify worker_error when worker fails', () => {
      const result = classifyOrchestrationFailure(
        undefined,
        undefined,
        undefined,
        { status: 'failure' as const, summary: 'Worker failed' },
        undefined
      );
      expect(result).toBe('worker_error');
    });

    it('should classify execution_error when execution has failed step', () => {
      const result = classifyOrchestrationFailure(
        undefined,
        undefined,
        {
          executionId: 'exec-1',
          workflowId: 'wf-1',
          workflowName: 'Test',
          status: 'FAILED' as const,
          mode: 'strict' as const,
          startedAt: new Date(),
          steps: [
            { stepId: 'step-1', status: 'COMPLETED' as const },
            { stepId: 'step-2', status: 'FAILED' as const, error: 'Step failed' },
          ],
          warnings: [],
          logs: [],
        },
        undefined,
        undefined
      );
      expect(result).toBe('execution_error');
    });

    it('should classify unknown when no failure detected', () => {
      const result = classifyOrchestrationFailure(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result).toBe('unknown');
    });
  });

  describe('classifyExecutionFailure', () => {
    it('should classify failed step', () => {
      const executionRecord = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        workflowName: 'Test',
        status: 'FAILED' as const,
        mode: 'strict' as const,
        startedAt: new Date(),
        steps: [
          { stepId: 'step-1', status: 'COMPLETED' as const },
          { stepId: 'step-2', status: 'FAILED' as const, error: 'Command failed' },
        ],
        warnings: [],
        logs: [],
      };
      const result = classifyExecutionFailure(executionRecord);
      expect(result.kind).toBe('execution_error');
      expect(result.reason).toBe('Command failed');
      expect(result.failedStepId).toBe('step-2');
    });

    it('should classify timeout', () => {
      const executionRecord = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        workflowName: 'Test',
        status: 'TIMEOUT' as const,
        mode: 'strict' as const,
        startedAt: new Date(),
        steps: [
          { stepId: 'step-1', status: 'TIMEOUT' as const, error: 'Step timed out' },
        ],
        warnings: [],
        logs: [],
      };
      const result = classifyExecutionFailure(executionRecord);
      expect(result.kind).toBe('execution_error');
      expect(result.reason).toContain('Timeout');
      expect(result.failedStepId).toBe('step-1');
    });

    it('should return unknown for no failed steps', () => {
      const executionRecord = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        workflowName: 'Test',
        status: 'COMPLETED' as const,
        mode: 'strict' as const,
        startedAt: new Date(),
        steps: [],
        warnings: [],
        logs: [],
      };
      const result = classifyExecutionFailure(executionRecord);
      expect(result.kind).toBe('unknown');
    });
  });

  describe('classifyWorkerFailure', () => {
    it('should classify cancelled worker', () => {
      const result = classifyWorkerFailure({ status: 'cancelled' as const, summary: '' });
      expect(result.kind).toBe('worker_error');
      expect(result.reason).toBe('Worker was cancelled');
    });

    it('should classify needs_review worker', () => {
      const result = classifyWorkerFailure({ status: 'needs_review' as const, summary: '' });
      expect(result.kind).toBe('worker_error');
      expect(result.reason).toBe('Worker result needs review');
    });

    it('should classify failure with error message', () => {
      const result = classifyWorkerFailure({
        status: 'failure' as const,
        summary: '',
        failureReason: 'Agent execution failed',
      });
      expect(result.kind).toBe('worker_error');
      expect(result.reason).toBe('Agent execution failed');
    });

    it('should return unknown for success', () => {
      const result = classifyWorkerFailure({ status: 'success' as const, summary: 'Done' });
      expect(result.kind).toBe('unknown');
    });
  });

  describe('decideOrchestrationRecovery', () => {
    it('should block on hash mismatch', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'execution_error',
        failureReason: 'Step failed',
        planHash: 'old-hash',
        currentPlanHash: 'new-hash',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 1,
        totalSteps: 3,
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('blocked');
      expect(result.reason).toBe('hash-mismatch');
    });

    it('should block on plan_validation_error', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'plan_validation_error',
        failureReason: 'Invalid plan',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 0,
        totalSteps: 0,
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('blocked');
      expect(result.reason).toBe('validation-error');
    });

    it('should block on draft_validation_error', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'draft_validation_error',
        failureReason: 'Invalid draft',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 0,
        totalSteps: 0,
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('blocked');
      expect(result.reason).toBe('validation-error');
    });

    it('should suggest_fix for verification_error with side effects', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'verification_error',
        failureReason: 'Tests failed',
        hasSideEffects: true,
        stepsCompleted: 2,
        stepsFailed: 1,
        totalSteps: 3,
        verificationResult: { status: 'fail' as const, failureReason: 'Test failure', commandResults: [], semanticResults: [], allSuccessCriteriaMet: false, planId: 'p1', durationMs: 100, startedAt: '', completedAt: '' },
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('suggest_fix');
      expect(result.mode).toBe('confirm_required');
    });

    it('should retry_direct for verification_error without side effects', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'verification_error',
        failureReason: 'Tests failed',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 1,
        totalSteps: 1,
        verificationResult: { status: 'fail' as const, failureReason: 'Test failure', commandResults: [], semanticResults: [], allSuccessCriteriaMet: false, planId: 'p1', durationMs: 100, startedAt: '', completedAt: '' },
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('retry_direct');
      expect(result.mode).toBe('confirm_required');
    });

    it('should suggest_fix for worker_error with side effects', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'worker_error',
        failureReason: 'Worker failed',
        hasSideEffects: true,
        stepsCompleted: 1,
        stepsFailed: 1,
        totalSteps: 3,
        workerResult: { status: 'failure' as const, summary: '' },
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('suggest_fix');
    });

    it('should retry_direct for worker_error without side effects', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'worker_error',
        failureReason: 'Worker failed',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 1,
        totalSteps: 1,
        workerResult: { status: 'failure' as const, summary: '' },
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('retry_direct');
    });

    it('should block on hash_mismatch failure kind', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'hash_mismatch',
        failureReason: 'Hash changed',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 0,
        totalSteps: 0,
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('blocked');
      expect(result.mode).toBe('manual_only');
    });

    it('should handle unknown failure kind as blocked', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'unknown',
        failureReason: 'Unknown error',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 0,
        totalSteps: 0,
      };
      const result = decideOrchestrationRecovery(input);
      expect(result.kind).toBe('blocked');
      expect(result.mode).toBe('manual_only');
    });
  });

  describe('buildRecoveryContext', () => {
    it('should build context with hash validity', () => {
      const input: OrchestrationRecoveryInput = {
        planId: 'plan-1',
        draftId: 'draft-1',
        traceId: 'trace-1',
        failureKind: 'execution_error',
        failureReason: 'Step failed',
        planHash: 'same-hash',
        currentPlanHash: 'same-hash',
        hasSideEffects: true,
        stepsCompleted: 2,
        stepsFailed: 1,
        totalSteps: 3,
      };
      const context = buildRecoveryContext(input);
      expect(context.hashValid).toBe(true);
      expect(context.canResume).toBe(true);
    });

    it('should mark hash invalid when hashes differ', () => {
      const input: OrchestrationRecoveryInput = {
        planId: 'plan-1',
        failureKind: 'execution_error',
        failureReason: 'Step failed',
        planHash: 'old-hash',
        currentPlanHash: 'new-hash',
        hasSideEffects: false,
        stepsCompleted: 0,
        stepsFailed: 1,
        totalSteps: 3,
      };
      const context = buildRecoveryContext(input);
      expect(context.hashValid).toBe(false);
      expect(context.canResume).toBe(false);
    });

    it('should not allow resume when no side effects and no steps completed', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'execution_error',
        failureReason: 'Step failed',
        hasSideEffects: true,
        stepsCompleted: 0,
        stepsFailed: 1,
        totalSteps: 3,
      };
      const context = buildRecoveryContext(input);
      expect(context.canResume).toBe(false);
    });

    it('should allow resume when partial execution with side effects', () => {
      const input: OrchestrationRecoveryInput = {
        failureKind: 'execution_error',
        failureReason: 'Step failed',
        traceId: 'trace-1',
        hasSideEffects: true,
        stepsCompleted: 2,
        stepsFailed: 1,
        totalSteps: 3,
      };
      const context = buildRecoveryContext(input);
      expect(context.canResume).toBe(true);
    });
  });

  describe('createOrchestrationRecoveryRecord', () => {
    it('should create recovery record with correct structure', () => {
      const result = createOrchestrationRecoveryRecord({
        recoveryRunId: 'rec-1',
        sourcePlanId: 'plan-1',
        planId: 'plan-1',
        decision: {
          kind: 'retry_direct',
          mode: 'confirm_required',
          reason: 'test',
          summary: 'Test decision',
          suggestedActions: ['Retry'],
          needsNewTrace: true,
          canReusePreviousCommand: true,
        },
        sourceTraceId: 'trace-1',
        recoveryTraceId: 'trace-2',
      });
      expect(result.recoveryRunId).toBe('rec-1');
      expect(result.sourcePlanId).toBe('plan-1');
      expect(result.status).toBe('planned');
      expect(result.startedAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });
});
