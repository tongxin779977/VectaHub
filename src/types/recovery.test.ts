import { describe, expect, it } from 'vitest';
import { decideRecovery, buildRecoveryInputFromRecord, createRecoveryRecord } from './recovery.js';
import type { DocTaskRecoveryInput } from './recovery.js';
import type { DocTaskFailureKind } from './doc-task.js';

function makeInput(overrides: Partial<DocTaskRecoveryInput> & Pick<DocTaskRecoveryInput, 'failureKind'>): DocTaskRecoveryInput {
  const { ...rest } = overrides;
  return {
    runId: 'run-001',
    taskId: 'task-001',
    taskLabel: 'Test Task',
    status: 'failed_agent',
    ...rest,
  };
}

describe('decideRecovery', () => {
  // ── §7.1 config → blocked ──
  it('should return blocked/manual_only for config failure', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'config' }));
    expect(decision.kind).toBe('blocked');
    expect(decision.mode).toBe('manual_only');
    expect(decision.needsNewTrace).toBe(false);
    expect(decision.canReusePreviousCommand).toBe(false);
    expect(decision.reason).toBe('config-failure');
  });

  // ── §7.4 conflict → blocked ──
  it('should return blocked/manual_only for conflict failure', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'conflict' }));
    expect(decision.kind).toBe('blocked');
    expect(decision.mode).toBe('manual_only');
    expect(decision.reason).toBe('conflict-detected');
  });

  // ── §7.4 system_internal → blocked ──
  it('should return blocked/manual_only for system_internal failure', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'system_internal' }));
    expect(decision.kind).toBe('blocked');
    expect(decision.mode).toBe('manual_only');
    expect(decision.reason).toBe('system-internal-error');
  });

  // ── cancelled → blocked ──
  it('should return blocked/manual_only for cancelled failure', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'cancelled' }));
    expect(decision.kind).toBe('blocked');
    expect(decision.mode).toBe('manual_only');
    expect(decision.reason).toBe('task-cancelled');
  });

  // ── §7.2 timeout + no changes → retry_direct ──
  it('should return retry_direct for timeout with no gitChanges and no verification', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'timeout',
      gitChanges: undefined,
      verification: undefined,
    }));
    expect(decision.kind).toBe('retry_direct');
    expect(decision.mode).toBe('confirm_required');
    expect(decision.needsNewTrace).toBe(true);
    expect(decision.canReusePreviousCommand).toBe(true);
    expect(decision.reason).toBe('timeout-no-changes');
  });

  it('should return retry_direct for timeout with zero changed files', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'timeout',
      gitChanges: { changedFileCount: 0, changedFiles: [] },
    }));
    expect(decision.kind).toBe('retry_direct');
    expect(decision.reason).toBe('timeout-no-changes');
  });

  // ── §7.2 json_protocol + no changes → retry_direct ──
  it('should return retry_direct for json_protocol with no gitChanges', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'json_protocol',
      gitChanges: undefined,
    }));
    expect(decision.kind).toBe('retry_direct');
    expect(decision.mode).toBe('confirm_required');
    expect(decision.reason).toBe('json-protocol-no-changes');
  });

  // ── §7.3 test → suggest_fix ──
  it('should return suggest_fix for test failure', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'test' }));
    expect(decision.kind).toBe('suggest_fix');
    expect(decision.mode).toBe('confirm_required');
    expect(decision.needsNewTrace).toBe(true);
    expect(decision.reason).toBe('verification-failed');
  });

  // ── §7.3 agent + has changes → suggest_fix ──
  it('should return suggest_fix for agent failure with gitChanges', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'agent',
      gitChanges: { changedFileCount: 3, changedFiles: ['a.ts', 'b.ts', 'c.ts'] },
    }));
    expect(decision.kind).toBe('suggest_fix');
    expect(decision.mode).toBe('confirm_required');
    expect(decision.reason).toBe('agent-failure-with-changes');
  });

  // ── agent + no changes → retry_direct ──
  it('should return retry_direct for agent failure with no gitChanges', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'agent',
      gitChanges: undefined,
    }));
    expect(decision.kind).toBe('retry_direct');
    expect(decision.mode).toBe('confirm_required');
    expect(decision.reason).toBe('agent-failure-no-changes');
  });

  // ── timeout + has changes → suggest_fix ──
  it('should return suggest_fix for timeout with gitChanges', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'timeout',
      gitChanges: { changedFileCount: 2, changedFiles: ['x.ts', 'y.ts'] },
    }));
    expect(decision.kind).toBe('suggest_fix');
    expect(decision.reason).toBe('timeout-with-changes');
  });

  // ── json_protocol + has changes → suggest_fix ──
  it('should return suggest_fix for json_protocol with gitChanges', () => {
    const decision = decideRecovery(makeInput({
      failureKind: 'json_protocol',
      gitChanges: { changedFileCount: 1, changedFiles: ['z.ts'] },
    }));
    expect(decision.kind).toBe('suggest_fix');
    expect(decision.reason).toBe('json-protocol-with-changes');
  });

  // ── unknown → suggest_fix ──
  it('should return suggest_fix for unknown failure', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'unknown' }));
    expect(decision.kind).toBe('suggest_fix');
    expect(decision.mode).toBe('confirm_required');
    expect(decision.reason).toBe('unknown-failure');
  });

  // ── §14 degradation: decision function error → blocked ──
  it('should degrade to blocked when input causes unexpected error', () => {
    // Force an internal error by passing a badly typed failureKind
    const badInput = { failureKind: '__invalid__' as DocTaskFailureKind, runId: 'r', taskId: 't', taskLabel: 'l', status: 'failed_agent' as const };
    const decision = decideRecovery(badInput);
    expect(decision.kind).toBe('blocked');
    expect(decision.mode).toBe('manual_only');
  });

  // ── Data contract: recovery input does not contain full stdout/stderr ──
  it('should build recovery input from run record without full stdout/stderr', () => {
    const input = buildRecoveryInputFromRecord({
      runId: 'run-100',
      taskId: 'task-100',
      taskLabel: 'Build something',
      docPath: '/docs/spec.md',
      traceId: 'tr-100',
      status: 'failed_agent',
      failureKind: 'agent',
      command: 'aider --message "implement X"',
      errorMessage: 'Agent exited with code 1',
      outputSummary: 'Failed to parse module',
      gitChanges: { changedFileCount: 2, changedFiles: ['a.ts', 'b.ts'], shortStat: '2 files changed' },
      verification: { ok: false, totalCommands: 2, passedCommands: 1, failedCommands: 1, failedCommandSummary: 'npm test' },
      agentTaskContract: {
        boundaryConfidence: 'high',
        allowedFiles: ['src/a.ts'],
        forbiddenFiles: ['.env'],
        validationCommands: ['npm run typecheck', 'npm test'],
        executionMode: 'serial',
      },
    });
    expect(input.runId).toBe('run-100');
    expect(input.failureKind).toBe('agent');
    // agentTaskContract should be converted to summary format (counts, not full arrays)
    expect(input.agentTaskContract?.allowedFileCount).toBe(1);
    expect(input.agentTaskContract?.forbiddenFileCount).toBe(1);
    expect(input.agentTaskContract?.validationCommandCount).toBe(2);
    // No full stdout/stderr fields
    expect(input).not.toHaveProperty('stdout');
    expect(input).not.toHaveProperty('stderr');
  });

  // ── createRecoveryRecord ──
  it('should create a recovery record with correct fields', () => {
    const decision = decideRecovery(makeInput({ failureKind: 'timeout', gitChanges: undefined }));
    const record = createRecoveryRecord({
      recoveryRunId: 'rec-001',
      sourceRunId: 'run-001',
      taskId: 'task-001',
      decision,
      sourceTraceId: 'tr-original',
      recoveryTraceId: 'tr-recovery',
      retryOfRunId: 'run-001',
    });
    expect(record.recoveryRunId).toBe('rec-001');
    expect(record.sourceRunId).toBe('run-001');
    expect(record.sourceTraceId).toBe('tr-original');
    expect(record.recoveryTraceId).toBe('tr-recovery');
    expect(record.retryOfRunId).toBe('run-001');
    expect(record.status).toBe('planned');
    expect(record.decision.kind).toBe('retry_direct');
    expect(record.startedAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
  });
});