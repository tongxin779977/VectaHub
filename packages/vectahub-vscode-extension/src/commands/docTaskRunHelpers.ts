import type { DocTask } from '../views/tasksView.js';
import { mapRunStatusToDisplayStatus, type DocTaskRunStatus } from '../project/docTaskState.js';
import type { DocTaskBatchRunRecord, DocTaskRunRecord, DocTaskRunStore } from '../project/docTaskRunStore.js';

export type WarnFn = (message: string) => void;

export function createRunId(taskId: string): string {
  return `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBatchRunId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function summarizeOutput(output?: string): string | undefined {
  if (!output) return undefined;
  return output.trim().slice(0, 600);
}

export async function safeUpdateRun(
  store: DocTaskRunStore | undefined,
  record: DocTaskRunRecord | undefined,
  label: string,
  warn: WarnFn
): Promise<void> {
  if (!store || !record) return;
  try {
    await store.updateRun(record);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[doc-task-run-store] ${label} 失败: ${msg}`);
  }
}

export async function safeUpdateBatch(
  store: DocTaskRunStore | undefined,
  record: DocTaskBatchRunRecord | undefined,
  label: string,
  warn: WarnFn
): Promise<void> {
  if (!store || !record) return;
  try {
    await store.updateBatch(record);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[doc-task-run-store] ${label} 失败: ${msg}`);
  }
}

export function setTaskDisplayState(task: DocTask, status: DocTaskRunStatus): void {
  task.status = mapRunStatusToDisplayStatus(status);
}

export async function applyLatestRunState(
  store: DocTaskRunStore | undefined,
  tasks: DocTask[],
  warn: WarnFn
): Promise<DocTask[]> {
  if (!store || tasks.length === 0) return tasks;

  try {
    const latest = await store.getLatestMap();
    return tasks.map(task => {
      const run = latest.get(task.id);
      if (!run) return task;
      return {
        ...task,
        status: mapRunStatusToDisplayStatus(run.status),
        lastRunId: run.runId,
        lastTraceId: run.traceId,
        lastFailureKind: run.failureKind,
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[doc-task-run-store] latest 读取失败: ${msg}`);
    return tasks;
  }
}
