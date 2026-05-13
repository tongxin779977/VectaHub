import { describe, expect, it, vi } from 'vitest';
import {
  applyLatestRunState,
  safeUpdateBatch,
  safeUpdateRun,
  setTaskDisplayState,
  summarizeOutput,
} from '../src/commands/docTaskRunHelpers.js';
import type { DocTaskRunStore } from '../src/project/docTaskRunStore.js';
import type { DocTask } from '../src/views/tasksView.js';

function makeStore(overrides: Partial<DocTaskRunStore>): DocTaskRunStore {
  return {
    startBatch: vi.fn() as any,
    updateBatch: vi.fn() as any,
    startRun: vi.fn() as any,
    updateRun: vi.fn() as any,
    getLatestByTaskId: vi.fn() as any,
    getLatestMap: vi.fn(async () => new Map()) as any,
    listRuns: vi.fn() as any,
    ...overrides,
  };
}

describe('doc task run helpers', () => {
  it('summarizes output to a bounded preview', () => {
    const summary = summarizeOutput(`  ${'x'.repeat(700)}  `);
    expect(summary).toHaveLength(600);
    expect(summary).toBe('x'.repeat(600));
  });

  it('maps run status onto task display status', () => {
    const task: DocTask = { id: '1', label: 'task' };
    setTaskDisplayState(task, 'failed_timeout');
    expect(task.status).toBe('failed');

    setTaskDisplayState(task, 'changed');
    expect(task.status).toBe('changed');
  });

  it('applies latest run state without mutating missing tasks', async () => {
    const latest = new Map([
      ['1', {
        runId: 'run-1',
        taskId: '1',
        taskLabel: 'task 1',
        agentCli: 'codex',
        status: 'failed_agent' as const,
        failureKind: 'agent' as const,
        traceId: 'tr_1',
        startedAt: '2026-05-13T00:00:00.000Z',
        updatedAt: '2026-05-13T00:00:01.000Z',
      }],
    ]);
    const store = makeStore({ getLatestMap: vi.fn(async () => latest) as any });
    const tasks = await applyLatestRunState(
      store,
      [{ id: '1', label: 'task 1' }, { id: '2', label: 'task 2' }],
      vi.fn()
    );

    expect(tasks[0]).toMatchObject({
      status: 'failed',
      lastRunId: 'run-1',
      lastTraceId: 'tr_1',
      lastFailureKind: 'agent',
    });
    expect(tasks[1]).toEqual({ id: '2', label: 'task 2' });
  });

  it('safe update helpers report warnings instead of throwing', async () => {
    const warn = vi.fn();
    const store = makeStore({
      updateRun: vi.fn(async () => { throw new Error('write failed'); }) as any,
      updateBatch: vi.fn(async () => { throw new Error('batch failed'); }) as any,
    });

    await safeUpdateRun(store, {
      runId: 'run',
      taskId: '1',
      taskLabel: 'task',
      agentCli: 'codex',
      status: 'running',
      startedAt: '2026-05-13T00:00:00.000Z',
      updatedAt: '2026-05-13T00:00:00.000Z',
    }, 'run write', warn);
    await safeUpdateBatch(store, {
      batchRunId: 'batch',
      agentCli: 'codex',
      status: 'running',
      totalCount: 1,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      startedAt: '2026-05-13T00:00:00.000Z',
      updatedAt: '2026-05-13T00:00:00.000Z',
    }, 'batch write', warn);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('write failed'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('batch failed'));
  });
});
