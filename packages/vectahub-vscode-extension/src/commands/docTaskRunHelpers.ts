import type { DocTask } from '../views/tasksView.js';
import { mapRunStatusToDisplayStatus, type DocTaskRunStatus } from '../project/docTaskState.js';
import { computeInstructionHash, type DocTaskBatchRunRecord, type DocTaskRunRecord, type DocTaskRunStore } from '../project/docTaskRunStore.js';

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
  warn: WarnFn,
  docContent?: string,
): Promise<DocTask[]> {
  if (!store || tasks.length === 0) return tasks;

  try {
    const latest = await store.getLatestMap();
    const tasksToReset: Array<{ task: DocTask; run: DocTaskRunRecord }> = [];

    const result = tasks.map(task => {
      const run = latest.get(task.id);
      if (!run) return task;

      // Hash drift detection: if the task label changed since the last run,
      // reset the task to "ready" so the user re-runs it.
      if (run.status === 'success' || run.status === 'changed') {
        const oldHash = run.instructionHash;
        if (oldHash && docContent) {
          const newHash = computeInstructionHash({
            taskId: task.id,
            label: task.label,
            docExcerpt: docContent.slice(0, 8000),
            tool: run.agentCli,
          });
          if (newHash !== oldHash) {
            tasksToReset.push({ task, run });
            return {
              ...task,
              status: 'ready' as const,
              lastRunId: run.runId,
              lastTraceId: run.traceId,
              lastFailureKind: undefined,
            };
          }
        }
      }

      return {
        ...task,
        status: mapRunStatusToDisplayStatus(run.status),
        lastRunId: run.runId,
        lastTraceId: run.traceId,
        lastFailureKind: run.failureKind,
      };
    });

    // Persist the reset status so the tree view stays in sync
    for (const { task, run } of tasksToReset) {
      const resetRecord: DocTaskRunRecord = {
        ...run,
        status: 'ready',
        failureKind: undefined,
        updatedAt: new Date().toISOString(),
      };
      try {
        await store.updateRun(resetRecord);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`[doc-task-run-store] hash drift reset 失败 (${task.id}): ${msg}`);
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[doc-task-run-store] latest 读取失败: ${msg}`);
    return tasks;
  }
}
