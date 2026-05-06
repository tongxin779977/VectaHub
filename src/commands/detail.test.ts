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
      if (id === 'exec_found') {
        return Promise.resolve({
          executionId: 'exec_found',
          workflowId: 'wf-1',
          workflowName: 'test-workflow',
          status: 'COMPLETED',
          startedAt: '2026-05-07T12:00:00.000Z',
          finishedAt: '2026-05-07T12:00:01.000Z',
          duration: 1000,
          triggeredBy: 'user',
          metadata: { source: 'nl' },
          steps: [
            { stepId: 'step_1', stepName: 'echo hello', command: 'echo hello', status: 'COMPLETED' },
            { stepId: 'step_2', stepName: 'ls -la', command: 'ls -la', status: 'COMPLETED', duration: 200 },
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

const { detailCmd } = await import('./detail.js');

describe('detail command', () => {
  beforeEach(() => {
    mockInfo.mockClear();
    mockError.mockClear();
  });

  it('should show not found for non-existent execution', async () => {
    await detailCmd.parseAsync(['node', 'test', 'exec_missing']);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should show execution details for existing execution', async () => {
    await detailCmd.parseAsync(['node', 'test', 'exec_found']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Execution Details'));
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('test-workflow'));
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('COMPLETED'));
  });

  it('should show specific step details with --step option', async () => {
    await detailCmd.parseAsync(['node', 'test', 'exec_found', '--step', '0']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('echo hello'));
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Status'));
  });

  it('should show error for out-of-range step index', async () => {
    await detailCmd.parseAsync(['node', 'test', 'exec_found', '-s', '99']);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('out of range'));
  });
});
