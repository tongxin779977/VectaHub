"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentTaskContractSummaries = buildAgentTaskContractSummaries;
exports.deriveDocExcerptForTask = deriveDocExcerptForTask;
exports.decideDocTaskBatchConcurrency = decideDocTaskBatchConcurrency;
exports.toRunContractSummary = toRunContractSummary;
const doc_task_contract_core_1 = require("@vectahub/doc-task-contract-core");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
function buildAgentTaskContractSummaries(input) {
    const result = new Map();
    const packageScripts = readPackageScripts(input.projectRoot);
    for (const task of input.tasks) {
        const excerpt = input.docContent
            ? (0, doc_task_contract_core_1.deriveDocExcerptFromTextSync)(input.docContent, { taskId: task.id, label: task.label })
            : { excerpt: '', truncated: false, strategy: 'none' };
        const boundary = (0, doc_task_contract_core_1.deriveAgentTaskBoundary)({
            docExcerpt: excerpt.excerpt,
            label: task.label,
            projectRoot: input.projectRoot,
            packageScripts,
        });
        result.set(task.id, {
            boundaryConfidence: boundary.boundaryConfidence,
            allowedFiles: boundary.allowedFiles,
            forbiddenFiles: boundary.forbiddenFiles,
            validationCommands: boundary.validationCommands,
            executionMode: boundary.parallelEligible ? 'parallel-eligible' : 'serial',
            docExcerptTruncated: excerpt.truncated,
            excerptStrategy: excerpt.strategy,
        });
    }
    return result;
}
function readPackageScripts(projectRoot) {
    if (!projectRoot)
        return [];
    const packageJsonPath = path_1.default.join(projectRoot, 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath))
        return [];
    try {
        const packageJson = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, 'utf8'));
        return Object.keys(packageJson.scripts ?? {});
    }
    catch {
        return [];
    }
}
function deriveDocExcerptForTask(input) {
    if (!input.docContent) {
        return { excerpt: '', truncated: false, strategy: 'none' };
    }
    return (0, doc_task_contract_core_1.deriveDocExcerptFromTextSync)(input.docContent, { taskId: input.taskId, label: input.label });
}
function decideDocTaskBatchConcurrency(input) {
    const summaries = [...input.contracts.values()];
    const requested = Math.max(1, Math.trunc(input.requestedMaxConcurrent || 1));
    if (summaries.some(contract => contract.boundaryConfidence !== 'medium' && contract.boundaryConfidence !== 'high')) {
        return { mode: 'serial', reason: 'unknown-boundary', effectiveMaxConcurrent: 1 };
    }
    if (summaries.some(contract => contract.allowedFiles.length === 0)) {
        return { mode: 'serial', reason: 'unknown-boundary', effectiveMaxConcurrent: 1 };
    }
    const contracts = [...input.contracts.entries()].map(([taskId, summary]) => ({
        taskId,
        label: taskId,
        allowedFiles: summary.allowedFiles,
        forbiddenFiles: summary.forbiddenFiles,
        boundaryConfidence: summary.boundaryConfidence,
        executionMode: summary.executionMode,
    }));
    const decision = (0, doc_task_contract_core_1.decideAgentTaskConcurrency)(contracts);
    if (decision.mode === 'serial' || contracts.length <= 1 || requested <= 1) {
        return {
            mode: 'serial',
            reason: contracts.length <= 1 || requested <= 1 ? 'insufficient-parallelism' : decision.reason,
            effectiveMaxConcurrent: 1,
        };
    }
    return { mode: 'parallel', reason: decision.reason, effectiveMaxConcurrent: requested };
}
function toRunContractSummary(summary) {
    if (!summary)
        return undefined;
    return {
        boundaryConfidence: summary.boundaryConfidence,
        allowedFileCount: summary.allowedFiles.length,
        forbiddenFileCount: summary.forbiddenFiles.length,
        validationCommandCount: summary.validationCommands.length,
        executionMode: summary.executionMode,
    };
}
//# sourceMappingURL=docTaskContract.js.map