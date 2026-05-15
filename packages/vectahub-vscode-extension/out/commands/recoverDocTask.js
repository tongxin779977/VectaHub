"use strict";
/**
 * P6 Self-Healing & Recovery — Plugin Recovery Command
 *
 * Registers `vectahubTasks.recoverDocTask` command.
 * Builds recovery input from the latest failed run record,
 * runs deterministic decision, and for retry_direct calls CLI recover-task.
 *
 * See docs/specs/recovery-loop.md.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRecoverDocTaskCommand = registerRecoverDocTaskCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const output_js_1 = require("../ui/output.js");
const docTaskRunStore_js_1 = require("../project/docTaskRunStore.js");
const docTaskRecovery_js_1 = require("../project/docTaskRecovery.js");
const index_js_1 = require("../trace/index.js");
const docTaskRunHelpers_js_1 = require("./docTaskRunHelpers.js");
const recoverDocTaskHash_js_1 = require("./recoverDocTaskHash.js");
function registerRecoverDocTaskCommand(context, tasksProvider) {
    const workspaceRoot = (0, adapter_js_1.getActiveWorkspaceFolder)();
    const runStore = workspaceRoot ? (0, docTaskRunStore_js_1.createDocTaskRunStore)(workspaceRoot) : undefined;
    const warnRunStore = (message) => (0, output_js_1.logToOutput)(message, 'warn');
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.recoverDocTask', async (task) => {
        if (!runStore) {
            vscode.window.showErrorMessage('无法初始化运行记录存储。');
            return;
        }
        // 1. Get latest run record for this task
        const latestRecord = await runStore.getLatestByTaskId(task.id);
        if (!latestRecord) {
            vscode.window.showWarningMessage(`任务 ${task.id} 没有运行记录，无法恢复。`);
            return;
        }
        // 2. Check eligibility
        if (!(0, docTaskRecovery_js_1.isRecoveryEligible)(latestRecord.status)) {
            vscode.window.showWarningMessage(`任务 ${task.id} 当前状态为 ${latestRecord.status}，不需要恢复。`);
            return;
        }
        // 3. Build recovery input from run record (strips sensitive data)
        // Compute current instructionHash with full contract factors for drift detection (§7.5)
        let currentHash;
        const currentDocPath = tasksProvider.getSelectedDocPath() || latestRecord.docPath;
        try {
            currentHash = await (0, docTaskRunHelpers_js_1.computeCurrentInstructionHashForRecovery)({
                taskId: task.id,
                label: task.label,
                docPath: currentDocPath,
                projectRoot: workspaceRoot,
                tool: latestRecord.agentCli,
            });
        }
        catch { /* ignore and let hash guard block when needed */ }
        const recoveryInput = (0, docTaskRecovery_js_1.buildRecoveryInput)(latestRecord, currentHash);
        const recoveryInstructionHash = (0, recoverDocTaskHash_js_1.resolveRecoveryInstructionHash)({
            currentHash,
            latestInstructionHash: latestRecord.instructionHash,
        });
        // 4. Deterministic recovery decision
        const decision = (0, docTaskRecovery_js_1.decideRecoveryWithHashGuard)(recoveryInput);
        (0, output_js_1.logToOutput)(`[recovery] 任务 ${task.id} 恢复决策: kind=${decision.kind}, mode=${decision.mode}, reason=${decision.reason}`);
        (0, output_js_1.logToOutput)(`[recovery] 摘要: ${decision.summary}`);
        // Persist the recovery record (decision is now known)
        const recoveryRunId = (0, docTaskRecovery_js_1.createRecoveryRunId)();
        const recoveryRecordForPersistence = (0, docTaskRecovery_js_1.createRecoveryRecord)({
            recoveryRunId,
            sourceRunId: latestRecord.runId,
            taskId: task.id,
            decision,
            sourceTraceId: latestRecord.traceId,
            retryOfRunId: latestRecord.runId,
        });
        // 5. Handle blocked
        if (decision.kind === 'blocked') {
            recoveryRecordForPersistence.status = 'blocked';
            recoveryRecordForPersistence.updatedAt = new Date().toISOString();
            recoveryRecordForPersistence.endedAt = recoveryRecordForPersistence.updatedAt;
            try {
                await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
            }
            catch { /* best-effort */ }
            vscode.window.showWarningMessage(`任务 ${task.id} 无法自动恢复: ${decision.summary}`, { modal: true, detail: decision.suggestedActions.join('\n') });
            return;
        }
        // 6. Handle suggest_fix (V1: guidance only)
        if (decision.kind === 'suggest_fix') {
            recoveryRecordForPersistence.status = 'planned';
            recoveryRecordForPersistence.updatedAt = new Date().toISOString();
            try {
                await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
            }
            catch { /* best-effort */ }
            const actions = decision.suggestedActions.map((a, i) => `${i + 1}. ${a}`).join('\n');
            await vscode.window.showInformationMessage(`任务 ${task.id} 恢复建议: ${decision.summary}`, { modal: true, detail: actions }, '了解');
            // V1 does not auto-execute fix tasks
            return;
        }
        // 7. Handle retry_direct — require user confirmation
        if (decision.kind === 'retry_direct') {
            if (decision.mode === 'confirm_required') {
                const confirmed = await vscode.window.showWarningMessage(`是否重试任务 ${task.id}?\n${decision.summary}`, { modal: true }, '确认重试', '取消');
                if (confirmed !== '确认重试') {
                    (0, output_js_1.logToOutput)(`[recovery] 用户取消重试任务 ${task.id}`);
                    return;
                }
            }
            // Update recovery record with trace info once we have it
            const agentCli = tasksProvider.getSelectedAgentCli();
            if (!agentCli) {
                vscode.window.showWarningMessage('请先选择 Agent CLI 执行器。');
                return;
            }
            const docPath = tasksProvider.getSelectedDocPath();
            // Start recovery trace
            const traceContext = (0, index_js_1.createRootTraceContext)();
            const recoverySpan = (0, index_js_1.startSpan)('vscode.docTask.recover', {
                context: traceContext,
                source: 'vscode',
                attributes: {
                    recovery: true,
                    recoveryKind: decision.kind,
                    sourceRunId: latestRecord.runId,
                    sourceTraceId: latestRecord.traceId,
                    sourceFailureKind: latestRecord.failureKind ?? 'unknown',
                    taskId: task.id,
                    taskLabel: task.label,
                },
            });
            // Update recovery record with trace info
            recoveryRecordForPersistence.recoveryTraceId = traceContext.traceId;
            recoveryRecordForPersistence.status = 'running';
            recoveryRecordForPersistence.updatedAt = new Date().toISOString();
            try {
                await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
            }
            catch { /* best-effort */ }
            // Update task display
            task.lastFailureKind = undefined;
            (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'running');
            tasksProvider.refresh();
            (0, output_js_1.logToOutput)(`[recovery] 正在重试任务 ${task.id}...`);
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `正在恢复任务 ${task.id}: ${task.label}`,
                    cancellable: false,
                }, async () => {
                    const args = [
                        'recover-task',
                        '--run-id', latestRecord.runId,
                        '--task-id', task.id,
                        '--task-label', task.label,
                        '--tool', agentCli,
                        '--trace-id', latestRecord.traceId ?? '',
                        '--source-failure-kind', latestRecord.failureKind ?? 'unknown',
                        '--decision-kind', decision.kind,
                        '--json',
                    ];
                    if (docPath) {
                        args.push('--doc', docPath);
                    }
                    if (latestRecord.command) {
                        args.push('--command', latestRecord.command);
                    }
                    if (latestRecord.instructionHash) {
                        args.push('--previous-instruction-hash', latestRecord.instructionHash);
                    }
                    if (currentHash) {
                        args.push('--current-instruction-hash', currentHash);
                    }
                    const result = await (0, adapter_js_1.runCli)(args, {
                        timeout: 600000,
                        traceContext: {
                            traceId: traceContext.traceId,
                            parentSpanId: recoverySpan.spanId,
                            source: 'vscode',
                        },
                    });
                    if (result.ok && result.data?.ok) {
                        // Recovery succeeded — write new run record
                        const newRunId = (0, docTaskRunHelpers_js_1.createRunId)(task.id);
                        const runResult = result.data.runResult;
                        const classification = (0, docTaskRecovery_js_1.classifyRecoveryOutcome)({
                            ok: result.data.ok,
                            status: result.data.status,
                            failureKind: result.data.failureKind,
                            runResult,
                            error: result.data.error,
                        });
                        task.lastRunId = newRunId;
                        task.lastTraceId = result.data.recoveryTraceId;
                        task.lastFailureKind = classification.failureKind;
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classification.status);
                        tasksProvider.refresh();
                        try {
                            const newRunRecord = await runStore.startRun({
                                runId: newRunId,
                                taskId: task.id,
                                taskLabel: task.label,
                                docPath,
                                agentCli,
                                status: classification.status,
                                command: runResult?.command,
                                traceId: result.data.recoveryTraceId,
                                retryOfRunId: latestRecord.runId,
                            });
                            newRunRecord.outputSummary = runResult?.output?.slice(0, 2000);
                            newRunRecord.outputTruncated = runResult?.outputTruncated;
                            newRunRecord.failureKind = classification.failureKind;
                            newRunRecord.instructionHash = recoveryInstructionHash;
                            newRunRecord.endedAt = new Date().toISOString();
                            newRunRecord.updatedAt = newRunRecord.endedAt;
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, newRunRecord, 'recovery result', warnRunStore);
                        }
                        catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            warnRunStore(`[recovery] 写入新 run record 失败: ${msg}`);
                        }
                        // Update persisted recovery record
                        recoveryRecordForPersistence.status = runResult?.ok ? 'success' : 'failed';
                        recoveryRecordForPersistence.recoveryTraceId = result.data.recoveryTraceId ?? recoveryRecordForPersistence.recoveryTraceId;
                        recoveryRecordForPersistence.updatedAt = new Date().toISOString();
                        recoveryRecordForPersistence.endedAt = recoveryRecordForPersistence.updatedAt;
                        try {
                            await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
                        }
                        catch { /* best-effort */ }
                        await recoverySpan.end({
                            recoveryStatus: classification.status,
                            recoveryRunId: result.data.recoveryRunId,
                        });
                        if (classification.status === 'success') {
                            vscode.window.showInformationMessage(`任务 ${task.id} 恢复成功！`);
                        }
                        else {
                            vscode.window.showWarningMessage(`任务 ${task.id} 恢复重试后仍然失败。`);
                        }
                    }
                    else {
                        // Recovery CLI returned failure
                        const errMsg = result.data?.error || result.error?.message || '恢复失败';
                        const classification = (0, docTaskRecovery_js_1.classifyRecoveryOutcome)({
                            ok: result.data?.ok,
                            status: result.data?.status,
                            failureKind: result.data?.failureKind,
                            runResult: result.data?.runResult,
                            error: errMsg,
                        });
                        recoveryRecordForPersistence.status = 'failed';
                        recoveryRecordForPersistence.updatedAt = new Date().toISOString();
                        recoveryRecordForPersistence.endedAt = recoveryRecordForPersistence.updatedAt;
                        try {
                            await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
                        }
                        catch { /* best-effort */ }
                        const newRunId = (0, docTaskRunHelpers_js_1.createRunId)(task.id);
                        task.lastRunId = newRunId;
                        task.lastTraceId = result.data?.recoveryTraceId ?? traceContext.traceId;
                        task.lastFailureKind = classification.failureKind;
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classification.status);
                        tasksProvider.refresh();
                        try {
                            const newRunRecord = await runStore.startRun({
                                runId: newRunId,
                                taskId: task.id,
                                taskLabel: task.label,
                                docPath,
                                agentCli,
                                status: classification.status,
                                command: latestRecord.command,
                                traceId: result.data?.recoveryTraceId ?? traceContext.traceId,
                                retryOfRunId: latestRecord.runId,
                            });
                            newRunRecord.failureKind = classification.failureKind;
                            newRunRecord.errorMessage = errMsg.slice(0, 1000);
                            newRunRecord.outputSummary = result.data?.runResult?.output?.slice(0, 2000);
                            newRunRecord.outputTruncated = result.data?.runResult?.outputTruncated;
                            newRunRecord.instructionHash = recoveryInstructionHash;
                            newRunRecord.endedAt = new Date().toISOString();
                            newRunRecord.updatedAt = newRunRecord.endedAt;
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, newRunRecord, 'recovery failed result', warnRunStore);
                        }
                        catch (persistErr) {
                            const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
                            warnRunStore(`[recovery] 写入失败 run record 失败: ${msg}`);
                        }
                        await recoverySpan.fail(new Error(errMsg), {
                            recoveryStatus: 'failed',
                        });
                        vscode.window.showErrorMessage(`任务 ${task.id} 恢复失败: ${errMsg}`);
                    }
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const classification = (0, docTaskRecovery_js_1.classifyRecoveryOutcome)({ error: msg });
                (0, output_js_1.logToOutput)(`[recovery] 恢复异常: ${msg}`, 'error');
                const newRunId = (0, docTaskRunHelpers_js_1.createRunId)(task.id);
                task.lastRunId = newRunId;
                task.lastTraceId = traceContext.traceId;
                task.lastFailureKind = classification.failureKind;
                (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classification.status);
                tasksProvider.refresh();
                try {
                    const newRunRecord = await runStore.startRun({
                        runId: newRunId,
                        taskId: task.id,
                        taskLabel: task.label,
                        docPath,
                        agentCli,
                        status: classification.status,
                        command: latestRecord.command,
                        traceId: traceContext.traceId,
                        retryOfRunId: latestRecord.runId,
                    });
                    newRunRecord.failureKind = classification.failureKind;
                    newRunRecord.errorMessage = msg.slice(0, 1000);
                    newRunRecord.instructionHash = recoveryInstructionHash;
                    newRunRecord.endedAt = new Date().toISOString();
                    newRunRecord.updatedAt = newRunRecord.endedAt;
                    await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, newRunRecord, 'recovery exception result', warnRunStore);
                }
                catch (persistErr) {
                    const persistMsg = persistErr instanceof Error ? persistErr.message : String(persistErr);
                    warnRunStore(`[recovery] 写入异常 run record 失败: ${persistMsg}`);
                }
                await recoverySpan.fail(err, { recoveryStatus: 'exception' });
                vscode.window.showErrorMessage(`任务 ${task.id} 恢复异常: ${msg}`);
            }
        }
    }));
}
//# sourceMappingURL=recoverDocTask.js.map