"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunId = createRunId;
exports.createBatchRunId = createBatchRunId;
exports.summarizeOutput = summarizeOutput;
exports.safeUpdateRun = safeUpdateRun;
exports.safeUpdateBatch = safeUpdateBatch;
exports.setTaskDisplayState = setTaskDisplayState;
exports.getAuthoritativeGlobalConfigDigestForHash = getAuthoritativeGlobalConfigDigestForHash;
exports.computeCurrentInstructionHashForRecovery = computeCurrentInstructionHashForRecovery;
exports.applyLatestRunState = applyLatestRunState;
const fs_1 = require("fs");
const docTaskContract_js_1 = require("../project/docTaskContract.js");
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
/**
 * Authoritative hash drift / recovery guard requires CLI-equivalent digest.
 * 插件侧当前无法证明与 CLI createLLMConfig() 等价，故权威路径返回 unavailable。
 */
async function getAuthoritativeGlobalConfigDigestForHash() {
    return undefined;
}
async function computeCurrentInstructionHashForRecovery(input) {
    const { taskId, label, docPath, projectRoot, tool } = input;
    if (!docPath || !projectRoot || !label)
        return undefined;
    const globalConfigDigest = await getAuthoritativeGlobalConfigDigestForHash();
    if (!globalConfigDigest)
        return undefined;
    const docContent = await fs_1.promises.readFile(docPath, 'utf8');
    const contracts = (0, docTaskContract_js_1.buildAgentTaskContractSummaries)({
        tasks: [{ id: taskId, label }],
        docContent,
        projectRoot,
    });
    const contract = contracts.get(taskId);
    if (!contract)
        return undefined;
    const excerpt = (0, docTaskContract_js_1.deriveDocExcerptForTask)({
        docContent,
        taskId,
        label,
    });
    return (0, docTaskRunStore_js_1.computeInstructionHash)({
        taskId,
        label,
        docExcerpt: excerpt.excerpt,
        tool,
        allowedFiles: contract.allowedFiles,
        forbiddenFiles: contract.forbiddenFiles,
        globalConfigDigest,
    });
}
async function applyLatestRunState(store, tasks, warn, docContent, projectRoot) {
    if (!store || tasks.length === 0)
        return tasks;
    try {
        const latest = await store.getLatestMap();
        const tasksToReset = [];
        const currentGlobalConfigDigest = await getAuthoritativeGlobalConfigDigestForHash();
        if (!currentGlobalConfigDigest) {
            return tasks.map(task => {
                const run = latest.get(task.id);
                if (!run)
                    return task;
                return {
                    ...task,
                    status: (0, docTaskState_js_1.mapRunStatusToDisplayStatus)(run.status),
                    lastRunId: run.runId,
                    lastTraceId: run.traceId,
                    lastFailureKind: run.failureKind,
                };
            });
        }
        const currentContracts = (docContent && projectRoot)
            ? (0, docTaskContract_js_1.buildAgentTaskContractSummaries)({
                tasks: tasks.map(task => ({ id: task.id, label: task.label })),
                docContent,
                projectRoot,
            })
            : new Map();
        const result = tasks.map(task => {
            const run = latest.get(task.id);
            if (!run)
                return task;
            // Hash drift detection: if the task label changed since the last run,
            // reset the task to "ready" so the user re-runs it.
            if (run.status === 'success' || run.status === 'changed') {
                const oldHash = run.instructionHash;
                if (oldHash && docContent) {
                    const currentContract = currentContracts.get(task.id);
                    const allowedFiles = currentContract?.allowedFiles ?? [];
                    const forbiddenFiles = currentContract?.forbiddenFiles ?? [];
                    const excerpt = (0, docTaskContract_js_1.deriveDocExcerptForTask)({
                        docContent,
                        taskId: task.id,
                        label: task.label,
                    });
                    const newHash = (0, docTaskRunStore_js_1.computeInstructionHash)({
                        taskId: task.id,
                        label: task.label,
                        docExcerpt: excerpt.excerpt,
                        tool: run.agentCli,
                        allowedFiles,
                        forbiddenFiles,
                        globalConfigDigest: currentGlobalConfigDigest,
                    });
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