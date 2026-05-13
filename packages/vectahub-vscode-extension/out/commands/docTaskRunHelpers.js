"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunId = createRunId;
exports.createBatchRunId = createBatchRunId;
exports.summarizeOutput = summarizeOutput;
exports.safeUpdateRun = safeUpdateRun;
exports.safeUpdateBatch = safeUpdateBatch;
exports.setTaskDisplayState = setTaskDisplayState;
exports.applyLatestRunState = applyLatestRunState;
const docTaskState_js_1 = require("../project/docTaskState.js");
const docTaskRunStore_js_1 = require("../project/docTaskRunStore.js");
function createRunId(taskId) {
    return `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createBatchRunId() {
    return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function summarizeOutput(output) {
    if (!output)
        return undefined;
    return output.trim().slice(0, 600);
}
async function safeUpdateRun(store, record, label, warn) {
    if (!store || !record)
        return;
    try {
        await store.updateRun(record);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`[doc-task-run-store] ${label} 失败: ${msg}`);
    }
}
async function safeUpdateBatch(store, record, label, warn) {
    if (!store || !record)
        return;
    try {
        await store.updateBatch(record);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`[doc-task-run-store] ${label} 失败: ${msg}`);
    }
}
function setTaskDisplayState(task, status) {
    task.status = (0, docTaskState_js_1.mapRunStatusToDisplayStatus)(status);
}
async function applyLatestRunState(store, tasks, warn, docContent) {
    if (!store || tasks.length === 0)
        return tasks;
    try {
        const latest = await store.getLatestMap();
        const tasksToReset = [];
        const result = tasks.map(task => {
            const run = latest.get(task.id);
            if (!run)
                return task;
            // Hash drift detection: if the task label changed since the last run,
            // reset the task to "ready" so the user re-runs it.
            if (run.status === 'success' || run.status === 'changed') {
                const oldHash = run.instructionHash;
                if (oldHash && docContent) {
                    const newHash = (0, docTaskRunStore_js_1.computeInstructionHash)(task.id, task.label, docContent.slice(0, 8000));
                    if (newHash !== oldHash) {
                        tasksToReset.push({ task, run });
                        return {
                            ...task,
                            status: 'ready',
                            lastRunId: run.runId,
                            lastTraceId: run.traceId,
                            lastFailureKind: undefined,
                        };
                    }
                }
            }
            return {
                ...task,
                status: (0, docTaskState_js_1.mapRunStatusToDisplayStatus)(run.status),
                lastRunId: run.runId,
                lastTraceId: run.traceId,
                lastFailureKind: run.failureKind,
            };
        });
        // Persist the reset status so the tree view stays in sync
        for (const { task, run } of tasksToReset) {
            const resetRecord = {
                ...run,
                status: 'ready',
                failureKind: undefined,
                updatedAt: new Date().toISOString(),
            };
            try {
                await store.updateRun(resetRecord);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                warn(`[doc-task-run-store] hash drift reset 失败 (${task.id}): ${msg}`);
            }
        }
        return result;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`[doc-task-run-store] latest 读取失败: ${msg}`);
        return tasks;
    }
}
//# sourceMappingURL=docTaskRunHelpers.js.map