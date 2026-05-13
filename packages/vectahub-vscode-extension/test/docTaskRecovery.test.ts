import { describe, expect, it } from 'vitest';
import {
  buildRecoveryInput,
  classifyRecoveryOutcome,
  decideRecovery,
  decideRecoveryWithHashGuard,
  createRecoveryRecord,
  createRecoveryRunId,
  isRecoveryEligible,
} from '../src/project/docTaskRecovery.js';
import type { DocTaskRecoveryInput } from '../src/project/docTaskRecovery.js';
import type { DocTaskRunRecord } from '../src/project/docTaskRunStore.js';
import type { DocTaskFailureKind } from '../src/project/docTaskState.js';

function makeRecord(overrides: Partial<DocTaskRunRecord>): DocTaskRunRecord {
  return {
    runId: 'run-001',
    taskId: 'task-001',
    taskLabel: 'Test Task',
    agentCli: 'aider',
    status: 'failed_agent',
    failureKind: 'agent',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('docTaskRecovery', () => {
  describe('buildRecoveryInput', () => {
    it('should build recovery input from run record stripping sensitive data', () => {
      const record = makeRecord({
        docPath: '/docs/spec.md',
        traceId: 'tr-100',
        failureKind: 'timeout',
        outputSummary: 'Agent timed out after 600s',
        gitChanges: { changedFileCount: 2, changedFiles: ['a.ts', 'b.ts'], shortStat: '2 files changed' },
        agentTaskContract: {
          boundaryConfidence: 'high',
          allowedFileCount: 3,
          forbiddenFileCount: 1,
          validationCommandCount: 2,
          executionMode: 'serial',
        },
      });

      const input = buildRecoveryInput(record);
      expect(input.runId).toBe('run-001');
      expect(input.taskId).toBe('task-001');
      expect(input.failureKind).toBe('timeout');
      expect(input.traceId).toBe('tr-100');
      expect(input.gitChanges?.changedFileCount).toBe(2);
      expect(input.agentTaskContract?.allowedFileCount).toBe(3);
      // No full stdout/stderr
      expect(input).not.toHaveProperty('stdout');
      expect(input).not.toHaveProperty('stderr');
    });

    it('should default failureKind to unknown when missing', () => {
      const record = makeRecord({ failureKind: undefined });
      const input = buildRecoveryInput(record);
      expect(input.failureKind).toBe('unknown');
    });
  });

  describe('decideRecovery', () => {
    function makeInput(failureKind: DocTaskFailureKind, overrides?: Partial<DocTaskRecoveryInput>): DocTaskRecoveryInput {
      return {
        runId: 'run-001',
        taskId: 'task-001',
        taskLabel: 'Test Task',
        status: 'failed_agent',
        failureKind,
        ...overrides,
      };
    }

    it('should return blocked for config failure', () => {
      const d = decideRecovery(makeInput('config'));
      expect(d.kind).toBe('blocked');
      expect(d.mode).toBe('manual_only');
    });

    it('should return blocked for conflict failure', () => {
      const d = decideRecovery(makeInput('conflict'));
      expect(d.kind).toBe('blocked');
      expect(d.mode).toBe('manual_only');
    });

    it('should return blocked for system_internal failure', () => {
      const d = decideRecovery(makeInput('system_internal'));
      expect(d.kind).toBe('blocked');
      expect(d.mode).toBe('manual_only');
    });

    it('should return blocked for cancelled failure', () => {
      const d = decideRecovery(makeInput('cancelled'));
      expect(d.kind).toBe('blocked');
      expect(d.mode).toBe('manual_only');
    });

    it('should return retry_direct for timeout with no changes', () => {
      const d = decideRecovery(makeInput('timeout'));
      expect(d.kind).toBe('retry_direct');
      expect(d.mode).toBe('confirm_required');
      expect(d.needsNewTrace).toBe(true);
    });

    it('should return retry_direct for json_protocol with no changes', () => {
      const d = decideRecovery(makeInput('json_protocol'));
      expect(d.kind).toBe('retry_direct');
    });

    it('should return suggest_fix for test failure', () => {
      const d = decideRecovery(makeInput('test'));
      expect(d.kind).toBe('suggest_fix');
    });

    it('should return suggest_fix for agent failure with gitChanges', () => {
      const d = decideRecovery(makeInput('agent', {
        gitChanges: { changedFileCount: 3, changedFiles: ['a.ts'] },
      }));
      expect(d.kind).toBe('suggest_fix');
    });

    it('should return retry_direct for agent failure with no gitChanges', () => {
      const d = decideRecovery(makeInput('agent'));
      expect(d.kind).toBe('retry_direct');
    });

    it('should return suggest_fix for timeout with gitChanges', () => {
      const d = decideRecovery(makeInput('timeout', {
        gitChanges: { changedFileCount: 1, changedFiles: ['x.ts'] },
      }));
      expect(d.kind).toBe('suggest_fix');
    });

    it('should return suggest_fix for unknown failure', () => {
      const d = decideRecovery(makeInput('unknown'));
      expect(d.kind).toBe('suggest_fix');
    });

    it('should degrade to blocked for invalid input', () => {
      const d = decideRecovery({
        runId: 'r', taskId: 't', taskLabel: 'l',
        status: 'failed_agent',
        failureKind: '__invalid__' as DocTaskFailureKind,
      });
      expect(d.kind).toBe('blocked');
    });

    it('should return blocked when instructionHash has changed (§7.5)', () => {
      const d = decideRecovery(makeInput('timeout', {
        previousInstructionHash: 'abc123',
        currentInstructionHash: 'def456',
      }));
      expect(d.kind).toBe('blocked');
      expect(d.mode).toBe('manual_only');
      expect(d.reason).toBe('instruction-changed');
    });

    it('should not block when instructionHash is the same', () => {
      const d = decideRecovery(makeInput('timeout', {
        previousInstructionHash: 'abc123',
        currentInstructionHash: 'abc123',
      }));
      expect(d.kind).toBe('retry_direct');
    });

    it('should block when previous instructionHash exists but currentHash is unavailable', () => {
      const d = decideRecoveryWithHashGuard(makeInput('timeout', {
        previousInstructionHash: 'abc123',
        currentInstructionHash: undefined,
      }));
      expect(d.kind).toBe('blocked');
      expect(d.mode).toBe('manual_only');
      expect(d.reason).toBe('instruction-hash-unavailable');
    });

    it('hash guard should not change normal decision when previous hash is absent', () => {
      const d = decideRecoveryWithHashGuard(makeInput('timeout', {
        previousInstructionHash: undefined,
        currentInstructionHash: undefined,
      }));
      expect(d.kind).toBe('retry_direct');
    });

    it('should not block when full-factor hash is already available and equal', () => {
      const d = decideRecoveryWithHashGuard(makeInput('timeout', {
        previousInstructionHash: 'same-full-factor-hash',
        currentInstructionHash: 'same-full-factor-hash',
      }));
      expect(d.kind).toBe('retry_direct');
    });
  });

  describe('isRecoveryEligible', () => {
    it('should return true for failed states', () => {
      expect(isRecoveryEligible('failed_config')).toBe(true);
      expect(isRecoveryEligible('failed_agent')).toBe(true);
      expect(isRecoveryEligible('failed_test')).toBe(true);
      expect(isRecoveryEligible('failed_timeout')).toBe(true);
      expect(isRecoveryEligible('cancelled')).toBe(true);
    });

    it('should return false for non-failed states', () => {
      expect(isRecoveryEligible('success')).toBe(false);
      expect(isRecoveryEligible('running')).toBe(false);
      expect(isRecoveryEligible('ready')).toBe(false);
      expect(isRecoveryEligible('changed')).toBe(false);
    });
  });

  describe('createRecoveryRecord', () => {
    it('should create a recovery record with correct fields', () => {
      const decision = decideRecovery({
        runId: 'run-001', taskId: 'task-001', taskLabel: 'Test',
        status: 'failed_timeout', failureKind: 'timeout',
      });
      const record = createRecoveryRecord({
        recoveryRunId: 'rec-001',
        sourceRunId: 'run-001',
        taskId: 'task-001',
        decision,
        sourceTraceId: 'tr-source',
        recoveryTraceId: 'tr-recovery',
        retryOfRunId: 'run-001',
      });
      expect(record.recoveryRunId).toBe('rec-001');
      expect(record.sourceRunId).toBe('run-001');
      expect(record.sourceTraceId).toBe('tr-source');
      expect(record.recoveryTraceId).toBe('tr-recovery');
      expect(record.retryOfRunId).toBe('run-001');
      expect(record.status).toBe('planned');
      expect(record.decision.kind).toBe('retry_direct');
    });
  });

  describe('createRecoveryRunId', () => {
    it('should generate unique IDs with rec- prefix', () => {
      const id1 = createRecoveryRunId();
      const id2 = createRecoveryRunId();
      expect(id1).toMatch(/^rec-/);
      expect(id2).toMatch(/^rec-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('classifyRecoveryOutcome', () => {
    it('should prefer CLI failureKind/status for failed recovery result', () => {
      const result = classifyRecoveryOutcome({
        ok: false,
        status: 'failed_timeout',
        failureKind: 'timeout',
        runResult: { ok: false, output: 'agent failed' },
      });
      expect(result.status).toBe('failed_timeout');
      expect(result.failureKind).toBe('timeout');
    });

    it('should infer failure from output when CLI omits failureKind', () => {
      const result = classifyRecoveryOutcome({
        ok: false,
        runResult: { ok: false, output: 'merge conflict detected' },
      });
      expect(result.status).toBe('failed_conflict');
      expect(result.failureKind).toBe('conflict');
    });

    it('should degrade to unknown/failed_agent when no classification info exists', () => {
      const result = classifyRecoveryOutcome({
        ok: false,
      });
      expect(result.status).toBe('failed_agent');
      expect(result.failureKind).toBe('unknown');
    });

    it('should classify verification failure as failed_test/test when failureKind is missing', () => {
      const result = classifyRecoveryOutcome({
        ok: false,
        runResult: {
          ok: false,
          output: 'verification failed',
          verification: {
            ok: false,
          },
        },
      });
      expect(result.status).toBe('failed_test');
      expect(result.failureKind).toBe('test');
    });

    it('should classify verification system error as failed_system_internal/system_internal', () => {
      const result = classifyRecoveryOutcome({
        ok: false,
        runResult: {
          ok: false,
          output: 'verification crashed',
          verification: {
            ok: false,
            isSystemError: true,
          },
        },
      });
      expect(result.status).toBe('failed_system_internal');
      expect(result.failureKind).toBe('system_internal');
    });
  });
});
