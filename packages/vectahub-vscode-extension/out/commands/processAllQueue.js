"use strict";
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
exports.registerProcessAllQueueCommand = registerProcessAllQueueCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const readiness_js_1 = require("../cli/readiness.js");
const taskHistory_js_1 = require("../project/taskHistory.js");
const output_js_1 = require("../ui/output.js");
function registerProcessAllQueueCommand(context, tasksProvider) {
    const processAllDisposable = vscode.commands.registerCommand('vectahubTasks.processAllQueue', async () => {
        const ready = await (0, readiness_js_1.waitForCliReady)();
        if (!ready)
            return;
        const beforeQueue = tasksProvider.readDiagnosticQueue();
        const pendingCount = beforeQueue.tasks.filter(t => t.status === 'pending').length;
        const processingCount = beforeQueue.tasks.filter(t => t.status === 'processing').length;
        if (pendingCount === 0) {
            const hint = processingCount > 0
                ? `队列中有 ${processingCount} 个处理中任务，无待处理任务。`
                : '队列为空，无需处理。';
            (0, output_js_1.logToOutput)(`[processAllQueue] ${hint}`);
            vscode.window.showInformationMessage(hint);
            return;
        }
        const confirmParts = [`队列中有 ${pendingCount} 个待处理任务`];
        if (processingCount > 0)
            confirmParts.push(`${processingCount} 个处理中`);
        confirmParts.push('确定要启动批量修复流程吗？');
        const confirm = await vscode.window.showWarningMessage(confirmParts.join('，'), { modal: true }, '开始处理');
        if (confirm !== '开始处理')
            return;
        (0, output_js_1.logToOutput)(`[processAllQueue] 开始批量处理: ${pendingCount} 个待处理任务`);
        const startedAt = new Date();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `VectaHub 正在进行批量诊断修复 (${pendingCount} 个任务)...`,
            cancellable: true
        }, async (progress, token) => {
            const result = await (0, adapter_js_1.runCli)(['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed', '--json'], { token });
            tasksProvider.refresh();
            if (!result.ok) {
                const endedAt = new Date();
                if (result.error?.code === 'CANCELLED') {
                    (0, output_js_1.logToOutput)(`[processAllQueue] 批量处理已由用户中止`);
                    (0, taskHistory_js_1.addTaskRecord)({
                        id: `process-queue-${Date.now()}`,
                        label: '批量处理诊断队列',
                        kind: 'process-queue',
                        source: 'vectahub',
                        status: 'cancelled',
                        command: `process ${pendingCount} pending tasks`,
                        startedAt,
                        endedAt
                    });
                    vscode.window.showInformationMessage('⏸ 批量处理已由用户中止');
                }
                else {
                    const errMsg = result.error?.message || '未知错误';
                    (0, output_js_1.logToOutput)(`[processAllQueue] 批量处理中断: ${errMsg}`, 'error');
                    (0, taskHistory_js_1.addTaskRecord)({
                        id: `process-queue-${Date.now()}`,
                        label: '批量处理诊断队列',
                        kind: 'process-queue',
                        source: 'vectahub',
                        status: 'failed',
                        command: `process ${pendingCount} pending tasks`,
                        startedAt,
                        endedAt,
                        errorMessage: errMsg
                    });
                    vscode.window.showErrorMessage(`❌ 批量处理中断: ${errMsg}`);
                }
                return;
            }
            const afterQueue = tasksProvider.readDiagnosticQueue();
            const workflowData = result.data;
            let completedNow;
            let failedCount;
            let pendingAfter;
            let needsConfirmCount;
            if (workflowData?.summary) {
                const s = workflowData.summary;
                completedNow = s.processedCount ?? 0;
                failedCount = s.failedCount ?? 0;
                pendingAfter = s.remainingCount ?? 0;
                needsConfirmCount = s.needsConfirmationCount ?? 0;
                (0, output_js_1.logToOutput)(`[processAllQueue] 使用CLI summary: processed=${completedNow}, failed=${failedCount}, remaining=${pendingAfter}, needsConfirmation=${needsConfirmCount}`);
            }
            else {
                const beforePendingIds = new Set(beforeQueue.tasks.filter(t => t.status === 'pending').map(t => t.id));
                completedNow = afterQueue.tasks.filter(t => t.status === 'completed' && beforePendingIds.has(t.id)).length;
                failedCount = afterQueue.tasks.filter(t => t.status === 'failed').length;
                pendingAfter = afterQueue.tasks.filter(t => t.status === 'pending').length;
                needsConfirmCount = afterQueue.tasks.filter(t => t.status === 'needs-confirmation').length;
                (0, output_js_1.logToOutput)(`[processAllQueue] 使用snapshot推算: completed=${completedNow}, failed=${failedCount}, pending=${pendingAfter}, needsConfirmation=${needsConfirmCount}`);
            }
            const endedAt = new Date();
            const historyStatus = failedCount > 0 ? 'failed' : 'success';
            (0, taskHistory_js_1.addTaskRecord)({
                id: `process-queue-${Date.now()}`,
                label: '批量处理诊断队列',
                kind: 'process-queue',
                source: 'vectahub',
                status: historyStatus,
                command: `处理 ${pendingCount} 个: 完成 ${completedNow}, 失败 ${failedCount}, 剩余 ${pendingAfter}, 待确认 ${needsConfirmCount}`,
                startedAt,
                endedAt,
                errorMessage: failedCount > 0 ? `${failedCount} 个任务处理失败` : undefined
            });
            (0, output_js_1.logToOutput)(`[processAllQueue] 批量处理完成: 已处理 ${completedNow}, 失败 ${failedCount}, 剩余待处理 ${pendingAfter}, 待确认 ${needsConfirmCount}`);
            const parts = [];
            if (completedNow > 0)
                parts.push(`✅ 已处理 ${completedNow}`);
            if (pendingAfter > 0)
                parts.push(`⏳ 剩余待处理 ${pendingAfter}`);
            if (failedCount > 0)
                parts.push(`❌ 失败 ${failedCount}`);
            if (needsConfirmCount > 0)
                parts.push(`⚠️ 待确认 ${needsConfirmCount}`);
            const msg = parts.length > 0
                ? `批量处理完成: ${parts.join(' / ')}`
                : '✅ 批量诊断任务处理完成';
            if (failedCount > 0 || pendingAfter > 0 || needsConfirmCount > 0) {
                vscode.window.showWarningMessage(msg, '查看详情').then(choice => {
                    if (choice === '查看详情') {
                        vscode.commands.executeCommand('workbench.action.output.toggleOutput');
                    }
                });
            }
            else {
                vscode.window.showInformationMessage(msg);
            }
        });
    });
    context.subscriptions.push(processAllDisposable);
    const removeTaskDisposable = vscode.commands.registerCommand('vectahubTasks.removeQueueTask', async (taskId) => {
        const ready = await (0, readiness_js_1.waitForCliReady)();
        if (!ready)
            return;
        const confirm = await vscode.window.showWarningMessage(`确定要删除任务 ${taskId} 吗？此操作不可撤销。`, { modal: true }, '删除');
        if (confirm !== '删除')
            return;
        (0, output_js_1.logToOutput)(`[removeQueueTask] 删除任务: ${taskId}`);
        const result = await (0, adapter_js_1.runCli)(['queue', 'remove', taskId, '--json']);
        if (result.ok) {
            tasksProvider.refresh();
            (0, output_js_1.logToOutput)(`[removeQueueTask] 任务 ${taskId} 删除成功`);
            vscode.window.showInformationMessage(`✅ 任务 ${taskId} 已删除`);
        }
        else {
            const errMsg = result.error?.message || '未知错误';
            (0, output_js_1.logToOutput)(`[removeQueueTask] 删除任务失败: ${errMsg}`, 'error');
            vscode.window.showErrorMessage(`❌ 删除失败: ${errMsg}`);
        }
    });
    context.subscriptions.push(removeTaskDisposable);
    const clearQueueDisposable = vscode.commands.registerCommand('vectahubTasks.clearQueue', async () => {
        const ready = await (0, readiness_js_1.waitForCliReady)();
        if (!ready)
            return;
        const queue = tasksProvider.readDiagnosticQueue();
        const taskCount = queue.tasks.length;
        if (taskCount === 0) {
            vscode.window.showInformationMessage('📋 队列为空，无需清空');
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`确定要清空队列吗？这将删除所有 ${taskCount} 个任务，此操作不可撤销。`, { modal: true }, '清空队列');
        if (confirm !== '清空队列')
            return;
        (0, output_js_1.logToOutput)(`[clearQueue] 清空队列: ${taskCount} 个任务`);
        const result = await (0, adapter_js_1.runCli)(['queue', 'clear', '--json', '--force']);
        if (result.ok) {
            tasksProvider.refresh();
            (0, output_js_1.logToOutput)('[clearQueue] 队列清空成功');
            vscode.window.showInformationMessage('✅ 队列已清空');
        }
        else {
            const errMsg = result.error?.message || '未知错误';
            (0, output_js_1.logToOutput)(`[clearQueue] 清空队列失败: ${errMsg}`, 'error');
            vscode.window.showErrorMessage(`❌ 清空失败: ${errMsg}`);
        }
    });
    context.subscriptions.push(clearQueueDisposable);
}
//# sourceMappingURL=processAllQueue.js.map