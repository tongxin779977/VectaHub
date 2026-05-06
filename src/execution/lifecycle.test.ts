import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLifecycleManager } from './lifecycle.js';
import type { ExecutionRecord } from './types.js';

function createMockEngine() {
  const workflows = new Map<string, { id: string; name: string; mode: string; steps: unknown[] }>();
  const executeFn = vi.fn().mockResolvedValue({
    executionId: 'exec_new',
    workflowId: 'wf-1',
    workflowName: 'test',
    status: 'COMPLETED',
    startedAt: '2026-05-07T12:00:00.000Z',
    steps: [],
  } as ExecutionRecord);
  const resumeFn = vi.fn().mockResolvedValue({
    executionId: 'exec_resumed',
    workflowId: 'wf-1',
    workflowName: 'test',
    status: 'COMPLETED',
    startedAt: '2026-05-07T12:00:00.000Z',
    steps: [],
  } as ExecutionRecord);

  return {
    workflows,
    execute: executeFn,
    resumeFromFailure: resumeFn,
    getWorkflow: vi.fn((id: string) => {
      return workflows.get(id);
    }),
    executeFn,
    resumeFn,
  };
}

function createMockRecordManager() {
  const records = new Map<string, ExecutionRecord>();
  return {
    records,
    save: vi.fn(async (record: ExecutionRecord) => {
      records.set(record.executionId, record);
    }),
    get: vi.fn(async (id: string) => {
      return records.get(id);
    }),
    list: vi.fn(async () => Array.from(records.values())),
    delete: vi.fn(async (id: string) => {
      return records.delete(id);
    }),
  };
}

describe('LifecycleManager', () => {
  let mockEngine: ReturnType<typeof createMockEngine>;
  let mockRecordManager: ReturnType<typeof createMockRecordManager>;
  let lifecycle: ReturnType<typeof createLifecycleManager>;

  beforeEach(() => {
    mockEngine = createMockEngine();
    mockRecordManager = createMockRecordManager();
    lifecycle = createLifecycleManager({
      engine: mockEngine as unknown as Parameters<typeof createLifecycleManager>[0]['engine'],
      recordManager: mockRecordManager as unknown as Parameters<typeof createLifecycleManager>[0]['recordManager'],
    });

    mockRecordManager.records.set('exec_1', {
      executionId: 'exec_1',
      workflowId: 'wf-1',
      workflowName: 'test-workflow',
      status: 'FAILED',
      startedAt: '2026-05-07T12:00:00.000Z',
      finishedAt: '2026-05-07T12:00:01.000Z',
      duration: 1000,
      steps: [
        { stepId: 'step_1', stepName: 'step 1', command: 'echo 1', status: 'COMPLETED' },
        { stepId: 'step_2', stepName: 'step 2', command: 'false', status: 'FAILED' },
      ],
    });

    mockEngine.workflows.set('wf-1', {
      id: 'wf-1',
      name: 'test-workflow',
      mode: 'relaxed',
      steps: [
        { id: 'step_1', type: 'exec', cli: 'echo 1' },
        { id: 'step_2', type: 'exec', cli: 'false' },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rerun', () => {
    it('should throw when execution not found', async () => {
      await expect(lifecycle.rerun('exec_nonexistent')).rejects.toThrow('Execution exec_nonexistent not found');
    });

    it('should throw when workflow not found', async () => {
      mockRecordManager.records.set('exec_no_wf', {
        executionId: 'exec_no_wf',
        workflowId: 'wf-missing',
        workflowName: 'test',
        status: 'COMPLETED',
        startedAt: '2026-05-07T12:00:00.000Z',
        steps: [],
      });

      await expect(lifecycle.rerun('exec_no_wf')).rejects.toThrow('Workflow wf-missing not found');
    });

    it('should re-execute the same workflow', async () => {
      const result = await lifecycle.rerun('exec_1');
      expect(result).toBeDefined();
      expect(mockEngine.executeFn).toHaveBeenCalledOnce();
    });

    it('should override mode when provided', async () => {
      await lifecycle.rerun('exec_1', { mode: 'strict' });
      expect(mockEngine.executeFn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'strict' }),
      );
    });
  });

  describe('resume', () => {
    it('should throw when execution not found', async () => {
      await expect(lifecycle.resume('exec_nonexistent')).rejects.toThrow('Execution exec_nonexistent not found');
    });

    it('should resume from failure point by default', async () => {
      const result = await lifecycle.resume('exec_1');
      expect(result).toBeDefined();
      expect(mockEngine.resumeFn).toHaveBeenCalledWith('exec_1', { mode: undefined });
    });
  });

  describe('resumeFromStep', () => {
    it('should throw when execution not found', async () => {
      await expect(lifecycle.resumeFromStep('exec_nonexistent', 0)).rejects.toThrow('Execution exec_nonexistent not found');
    });

    it('should call resumeFromFailure with correct executionId', async () => {
      const result = await lifecycle.resumeFromStep('exec_1', 1, { mode: 'relaxed' });
      expect(result).toBeDefined();
      expect(mockEngine.resumeFn).toHaveBeenCalledWith('exec_1', { mode: 'relaxed' });
    });
  });
});
