import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';

// Mock run-task before importing recover-task
vi.mock('./run-task.js', () => ({
  runTask: vi.fn(),
  formatRunTaskJson: vi.fn((r: unknown) => r),
}));

// Mock trace infrastructure
vi.mock('../infrastructure/trace/index.js', () => ({
  startSpan: vi.fn(() => ({
    traceId: 'tr-recovery-001',
    spanId: 'span-001',
    end: vi.fn(),
    fail: vi.fn(),
  })),
  createChildEnv: vi.fn(() => ({})),
  getTraceContextFromEnv: vi.fn(() => undefined),
}));

import { recoverTask } from './recover-task.js';
import { runTask } from './run-task.js';

const runTaskMock = vi.mocked(runTask);

describe('recover-task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaultContext();
  });

  it('should handle retry_direct by re-executing the task', async () => {
    const { createChildEnv } = await import('../infrastructure/trace/index.js');
    const createChildEnvMock = vi.mocked(createChildEnv);
    runTaskMock.mockResolvedValueOnce({
      success: true,
      output: 'Task completed successfully',
      command: 'aider --message "test"',
    });

    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-001',
      taskId: 'task-001',
      taskLabel: 'Implement feature X',
      tool: 'aider',
      traceId: 'tr-original-001',
      sourceFailureKind: 'timeout',
      command: 'aider --message "test"',
    });

    expect(result.ok).toBe(true);
    expect(result.decision.kind).toBe('retry_direct');
    expect(result.recoveryRunId).toBeTruthy();
    expect(result.sourceRunId).toBe('run-failed-001');
    expect(result.sourceTraceId).toBe('tr-original-001');
    expect(result.recoveryTraceId).toBe('tr-recovery-001');
    expect(result.recoveryRecord).toBeDefined();
    expect(result.recoveryRecord?.retryOfRunId).toBe('run-failed-001');
    expect(result.recoveryRecord?.status).toBe('success');
    expect(runTaskMock).toHaveBeenCalledWith({
      tool: 'aider',
      taskId: 'task-001',
      taskLabel: 'Implement feature X',
      doc: undefined,
    });
    expect(createChildEnvMock).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'tr-recovery-001',
        parentSpanId: 'span-001',
        source: 'cli',
      }),
      'span-001',
    );
  });

  it('should handle retry_direct failure', async () => {
    runTaskMock.mockResolvedValueOnce({
      success: false,
      output: 'timed out after 10m',
      command: 'aider --message "test"',
    });

    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-002',
      taskId: 'task-002',
      taskLabel: 'Implement feature Y',
      tool: 'aider',
      sourceFailureKind: 'timeout',
    });

    expect(result.ok).toBe(false);
    expect(result.decision.kind).toBe('retry_direct');
    expect(result.recoveryRecord?.status).toBe('failed');
    expect(result.failureKind).toBe('timeout');
    expect(result.status).toBe('failed');
  });

  it('should classify failed recovery with verification failure as test failure', async () => {
    runTaskMock.mockResolvedValueOnce({
      success: false,
      output: 'agent completed but tests failed',
      command: 'aider --message "test"',
      verification: {
        ok: false,
        commands: [],
      },
    });

    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-test',
      taskId: 'task-test',
      taskLabel: 'Fix verification',
      tool: 'aider',
      sourceFailureKind: 'timeout',
    });

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('test');
    expect(result.status).toBe('failed');
  });

  it('should classify failed recovery with verification system error as system_internal', async () => {
    type VerificationWithSystemFlag = {
      ok: boolean;
      commands: Array<{ command: string; passed: boolean; output?: string }>;
      isSystemError?: boolean;
    };

    runTaskMock.mockResolvedValueOnce({
      success: false,
      output: 'verification could not run',
      command: 'aider --message "test"',
      verification: {
        ok: false,
        commands: [],
        isSystemError: true,
      } as VerificationWithSystemFlag,
    });

    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-system',
      taskId: 'task-system',
      taskLabel: 'Fix verification system error',
      tool: 'aider',
      sourceFailureKind: 'timeout',
    });

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('system_internal');
    expect(result.status).toBe('failed');
  });

  it('should block recovery for config failure', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-003',
      taskId: 'task-003',
      taskLabel: 'Implement feature Z',
      tool: 'aider',
      sourceFailureKind: 'config',
    });

    expect(result.ok).toBe(false);
    expect(result.decision.kind).toBe('blocked');
    expect(result.decision.mode).toBe('manual_only');
    expect(result.recoveryRecord?.status).toBe('blocked');
    expect(runTaskMock).not.toHaveBeenCalled();
  });

  it('should block recovery for conflict failure', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-004',
      taskId: 'task-004',
      taskLabel: 'Fix conflict',
      tool: 'aider',
      sourceFailureKind: 'conflict',
    });

    expect(result.ok).toBe(false);
    expect(result.decision.kind).toBe('blocked');
    expect(runTaskMock).not.toHaveBeenCalled();
  });

  it('should return guidance for suggest_fix (not auto-execute)', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-005',
      taskId: 'task-005',
      taskLabel: 'Fix test failure',
      tool: 'aider',
      sourceFailureKind: 'test',
    });

    expect(result.ok).toBe(false);
    expect(result.decision.kind).toBe('suggest_fix');
    expect(result.recoveryRecord?.status).toBe('planned');
    expect(result.decision.suggestedActions.length).toBeGreaterThan(0);
    expect(runTaskMock).not.toHaveBeenCalled();
  });

  it('should use plugin-precomputed decision when provided', async () => {
    runTaskMock.mockResolvedValueOnce({
      success: true,
      output: 'Retry succeeded',
      command: 'aider --message "test"',
    });

    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-006',
      taskId: 'task-006',
      taskLabel: 'Something',
      tool: 'aider',
      sourceFailureKind: 'agent',
      decisionKind: 'retry_direct',
    });

    expect(result.decision.kind).toBe('retry_direct');
    expect(result.decision.reason).toBe('plugin-precomputed');
    expect(result.ok).toBe(true);
    expect(runTaskMock).toHaveBeenCalled();
  });

  it('should create recovery trace with correct attributes', async () => {
    const { startSpan } = await import('../infrastructure/trace/index.js');
    const startSpanMock = vi.mocked(startSpan);

    runTaskMock.mockResolvedValueOnce({
      success: true,
      output: 'ok',
      command: 'test',
    });

    await recoverTask(getDefaultContext(), {
      runId: 'run-007',
      taskId: 'task-007',
      taskLabel: 'Test trace',
      tool: 'aider',
      traceId: 'tr-source-007',
      sourceFailureKind: 'timeout',
    });

    expect(startSpanMock).toHaveBeenCalledWith('cli.recover-task', {
      source: 'cli',
      attributes: expect.objectContaining({
        recovery: true,
        recoveryKind: 'retry_direct',
        sourceRunId: 'run-007',
        sourceTraceId: 'tr-source-007',
        sourceFailureKind: 'timeout',
      }),
    });
  });

  it('should block and skip runTask when instruction hash drift is detected', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-012',
      taskId: 'task-012',
      taskLabel: 'Hash drift task',
      tool: 'aider',
      sourceFailureKind: 'timeout',
      previousInstructionHash: 'old-hash',
      currentInstructionHash: 'new-hash',
    });

    expect(result.ok).toBe(false);
    expect(result.decision.kind).toBe('blocked');
    expect(result.decision.reason).toBe('instruction-changed');
    expect(runTaskMock).not.toHaveBeenCalled();
  });

  it('should block hash drift before using plugin-precomputed decision', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-013',
      taskId: 'task-013',
      taskLabel: 'Hash drift with precomputed retry',
      tool: 'aider',
      sourceFailureKind: 'timeout',
      decisionKind: 'retry_direct',
      previousInstructionHash: 'old-hash',
      currentInstructionHash: 'new-hash',
    });

    expect(result.ok).toBe(false);
    expect(result.decision.kind).toBe('blocked');
    expect(result.decision.reason).toBe('instruction-changed');
    expect(runTaskMock).not.toHaveBeenCalled();
  });

  it('should handle unknown failure kind as suggest_fix', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-008',
      taskId: 'task-008',
      taskLabel: 'Unknown error',
      tool: 'aider',
      sourceFailureKind: 'unknown',
    });

    expect(result.decision.kind).toBe('suggest_fix');
    expect(result.ok).toBe(false);
  });

  it('should fallback to unknown when sourceFailureKind is not provided', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-009',
      taskId: 'task-009',
      taskLabel: 'No failure kind',
      tool: 'aider',
    });

    // defaults to 'unknown' failureKind → suggest_fix
    expect(result.decision.kind).toBe('suggest_fix');
  });

  it('should map system_internal to failed_system_internal status', async () => {
    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-failed-010',
      taskId: 'task-010',
      taskLabel: 'System error',
      tool: 'aider',
      sourceFailureKind: 'system_internal',
    });

    expect(result.decision.kind).toBe('blocked');
    expect(result.decision.reason).toBe('system-internal-error');
  });

  it('should include recoveryTraceId in result for trace association', async () => {
    runTaskMock.mockResolvedValueOnce({
      success: true,
      output: 'ok',
      command: 'test',
    });

    const result = await recoverTask(getDefaultContext(), {
      runId: 'run-011',
      taskId: 'task-011',
      taskLabel: 'Trace check',
      tool: 'aider',
      traceId: 'tr-source-011',
      sourceFailureKind: 'timeout',
    });

    expect(result.sourceTraceId).toBe('tr-source-011');
    expect(result.recoveryTraceId).toBe('tr-recovery-001');
    expect(result.recoveryRecord?.sourceTraceId).toBe('tr-source-011');
    expect(result.recoveryRecord?.recoveryTraceId).toBe('tr-recovery-001');
    expect(result.recoveryRecord?.retryOfRunId).toBe('run-011');
  });
});
