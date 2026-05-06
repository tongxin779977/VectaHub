import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('../utils/logger.js', () => ({
  createConsoleLogger: vi.fn(() => ({
    info: mockInfo,
    error: mockError,
    debug: vi.fn(),
  })),
}));

vi.mock('../execution/record-manager.js', () => ({
  createRecordManager: vi.fn(() => ({
    get: vi.fn((id: string) => {
      if (id === 'exec_failed') {
        return Promise.resolve({
          executionId: 'exec_failed',
          workflowId: 'wf-1',
          workflowName: 'test-workflow',
          status: 'FAILED',
          startedAt: '2026-05-07T12:00:00.000Z',
          steps: [
            { stepId: 'step_1', stepName: 'echo hello', command: 'echo hello', status: 'COMPLETED' },
            { stepId: 'step_2', stepName: 'false', command: 'false', status: 'FAILED' },
          ],
        });
      }
      if (id === 'exec_done') {
        return Promise.resolve({
          executionId: 'exec_done',
          workflowId: 'wf-1',
          workflowName: 'test-workflow',
          status: 'COMPLETED',
          startedAt: '2026-05-07T12:00:00.000Z',
          steps: [
            { stepId: 'step_1', stepName: 'echo hello', command: 'echo hello', status: 'COMPLETED' },
          ],
        });
      }
      return Promise.resolve(undefined);
    }),
    list: vi.fn(() => Promise.resolve([])),
    save: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock('../workflow/engine.js', () => ({
  createWorkflowEngine: vi.fn(() => ({
    getWorkflow: vi.fn(() => Promise.resolve(undefined)),
    execute: vi.fn(),
    resumeFromFailure: vi.fn(() => Promise.resolve({
      executionId: 'exec_resumed',
      workflowId: 'wf-1',
      workflowName: 'test-workflow',
      status: 'COMPLETED',
      startedAt: '2026-05-07T13:00:00.000Z',
      duration: 300,
      steps: [],
    })),
  })),
}));

const { resumeCmd } = await import('./resume.js');

describe('resume command', () => {
  beforeEach(() => {
    mockInfo.mockClear();
    mockError.mockClear();
  });

  it('should show not found for non-existent execution', async () => {
    await resumeCmd.parseAsync(['node', 'test', 'exec_missing']);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should refuse to resume from completed execution', async () => {
    await resumeCmd.parseAsync(['node', 'test', 'exec_done']);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('no failed or paused step'));
  });

  it('should resume from failed execution', async () => {
    await resumeCmd.parseAsync(['node', 'test', 'exec_failed']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Resuming'));
  });
});
