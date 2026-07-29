import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('../execution/record-manager.js', () => ({
  createRecordManager: vi.fn(() => ({
    get: vi.fn((id: string) => {
      if (id === 'exec_found') {
        return Promise.resolve({
          executionId: 'exec_found',
          workflowId: 'wf-1',
          workflowName: 'test-workflow',
          status: 'COMPLETED',
          startedAt: '2026-05-07T12:00:00.000Z',
          finishedAt: '2026-05-07T12:00:01.000Z',
          duration: 1000,
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
    getWorkflow: vi.fn((id: string) => {
      if (id === 'wf-1') {
        return Promise.resolve({
          id: 'wf-1',
          name: 'test-workflow',
          mode: 'relaxed',
          steps: [{ id: 'step_1', type: 'exec', cli: 'echo hello' }],
        });
      }
      return Promise.resolve(undefined);
    }),
    execute: vi.fn(() => Promise.resolve({
      executionId: 'exec_new',
      workflowId: 'wf-1',
      workflowName: 'test-workflow',
      status: 'COMPLETED',
      startedAt: '2026-05-07T13:00:00.000Z',
      duration: 500,
      steps: [],
    })),
    resumeFromFailure: vi.fn(),
  })),
}));

function createMockContext() {
  return {
    audit: {
      getHelper: () => ({ log: vi.fn(), cliOutput: vi.fn(), securityAlert: vi.fn(), securityAction: vi.fn() }),
      getLogger: () => ({ getSessionId: () => 'test-session' }),
    },
    environment: { getPath: vi.fn(() => '/test/vectahub/executions') } as any,
    logger: {
      getLogger: () => ({ info: mockInfo, error: mockError, debug: vi.fn(), warn: vi.fn() }),
      setMuted: vi.fn(),
    },
  };
}

const { createRerunCmd } = await import('./rerun.js');

describe('rerun command', () => {
  beforeEach(() => {
    mockInfo.mockClear();
    mockError.mockClear();
  });

  it('should show not found for non-existent execution', async () => {
    await createRerunCmd(createMockContext() as never).parseAsync(['node', 'test', 'exec_missing']);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should re-run existing execution', async () => {
    await createRerunCmd(createMockContext() as never).parseAsync(['node', 'test', 'exec_found']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Re-running'));
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('exec_new'));
  });
});
