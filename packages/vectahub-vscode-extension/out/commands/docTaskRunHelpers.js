"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunId = createRunId;
exports.createBatchRunId = createBatchRunId;
exports.summarizeOutput = summarizeOutput;
exports.safeUpdateRun = safeUpdateRun;
exports.safeUpdateBatch = safeUpdateBatch;
exports.setTaskDisplayState = setTaskDisplayState;
exports.applyLatestRunState = applyLatestRunState;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const adapter_js_1 = require("../cli/adapter.js");
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
async function readCurrentGlobalConfigDigest() {
    const envModel = process.env.VECTAHUB_LLM_MODEL?.trim();
    const envTemp = process.env.VECTAHUB_LLM_TEMPERATURE?.trim();
    if (envModel || envTemp) {
        return `model=${envModel || 'unknown'};temperature=${envTemp || 'default'}`;
    }
    const configPath = path_1.default.join((0, adapter_js_1.getVectaHubHome)(), 'config.yaml');
    try {
        const raw = await fs_1.promises.readFile(configPath, 'utf8');
        const model = raw.match(/^\s*model:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim() || 'unknown';
        const temperature = raw.match(/^\s*temperature:\s*([0-9.]+)\s*$/m)?.[1]?.trim() || 'default';
        return `model=${model};temperature=${temperature}`;
    }
    catch {
        return undefined;
    }
}
async function applyLatestRunState(store, tasks, warn, docContent, projectRoot) {
    if (!store || tasks.length === 0)
        return tasks;
    try {
        const latest = await store.getLatestMap();
        const tasksToReset = [];
        const currentGlobalConfigDigest = await readCurrentGlobalConfigDigest();
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
                    const newHash = (0, docTaskRunStore_js_1.computeInstructionHash)({
                        taskId: task.id,
                        label: task.label,
                        docExcerpt: docContent.slice(0, 8000),
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