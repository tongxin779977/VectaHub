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
exports.registerSyncAndFixCiCommand = registerSyncAndFixCiCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const readiness_js_1 = require("../cli/readiness.js");
const taskHistory_js_1 = require("../project/taskHistory.js");
const output_js_1 = require("../ui/output.js");
function extractPendingCount(workflowResult, queue) {
    if (workflowResult?.summary?.pendingCount !== undefined) {
        return workflowResult.summary.pendingCount;
    }
    return queue.tasks.filter(t => t.status === 'pending' || t.status === 'needs-confirmation').length;
}
function registerSyncAndFixCiCommand(context, tasksProvider) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.syncAndFixCi', async () => {
        const ready = await (0, readiness_js_1.waitForCliReady)();
        if (!ready)
            return;
        (0, output_js_1.logToOutput)('[syncAndFixCi] 开始同步并修复');
        const startedAt = new Date();
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'VectaHub: 同步并修复...',
            cancellable: true
        }, async (_progress, token) => {
            const fetchResult = await (0, adapter_js_1.runCli)(['run', '-f', 'sys:fetch-gh-actions-errors', '--json'], { token });
            if (!fetchResult.ok) {
                if (fetchResult.error?.code === 'CANCELLED') {
                    (0, output_js_1.logToOutput)('[syncAndFixCi] 拉取已由用户取消');
                    vscode.window.showInformationMessage('⏸ 同步已取消');
                }
                else {
                    const errMsg = fetchResult.error?.message || fetchResult.stderr || '未知错误';
                    (0, output_js_1.logToOutput)(`[syncAndFixCi] 拉取失败: ${errMsg}`, 'error');
                    vscode.window.showErrorMessage(`❌ 同步失败: ${errMsg}`);
                }
                return;
            }
            const queue = tasksProvider.readDiagnosticQueue();
            const workflowData = fetchResult.data;
            const pendingCount = extractPendingCount(workflowData, queue);
            tasksProvider.refresh();
            if (pendingCount === 0) {
                (0, output_js_1.logToOutput)('[syncAndFixCi] 拉取完成，无待处理项');
                vscode.window.showInformationMessage('✅ 同步完成，无待处理项');
                return;
            }
            const confirm = await vscode.window.showWarningMessage(`发现 ${pendingCount} 个待处理项，是否自动修复？`, { modal: true }, '开始修复');
            if (confirm !== '开始修复') {
                (0, output_js_1.logToOutput)('[syncAndFixCi] 用户取消修复');
                vscode.window.showInformationMessage('已取消');
                return;
            }
            (0, output_js_1.logToOutput)(`[syncAndFixCi] 开始批量修复: ${pendingCount} 个待处理任务`);
            const processResult = await (0, adapter_js_1.runCli)(['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed', '--json'], { token });
            tasksProvider.refresh();
            const endedAt = new Date();
            if (!processResult.ok) {
                if (processResult.error?.code === 'CANCELLED') {
                    (0, output_js_1.logToOutput)('[syncAndFixCi] 批量修复已由用户中止');
                    (0, taskHistory_js_1.addTaskRecord)({
                        id: `sync-fix-${Date.now()}`,
                        label: '同步并修复',
                        kind: 'sync-fix',
                        source: 'vectahub',
                        status: 'cancelled',
                        command: `sync ${pendingCount} pending tasks`,
                        startedAt,
                        endedAt
                    });
                    vscode.window.showInformationMessage('⏸ 批量修复已由用户中止');
                }
                else {
                    const errMsg = processResult.error?.message || '未知错误';
                    (0, output_js_1.logToOutput)(`[syncAndFixCi] 批量修复中断: ${errMsg}`, 'error');
                    (0, taskHistory_js_1.addTaskRecord)({
                        id: `sync-fix-${Date.now()}`,
                        label: '同步并修复',
                        kind: 'sync-fix',
                        source: 'vectahub',
                        status: 'failed',
                        command: `sync ${pendingCount} pending tasks`,
                        startedAt,
                        endedAt,
                        errorMessage: errMsg
                    });
                    vscode.window.showErrorMessage(`❌ 批量修复中断: ${errMsg}`);
                }
                return;
            }
            const processData = processResult.data;
            const completedNow = processData?.summary?.processedCount ?? 0;
            const failedCount = processData?.summary?.failedCount ?? 0;
            const pendingAfter = processData?.summary?.remainingCount ?? 0;
            const needsConfirmCount = processData?.summary?.needsConfirmationCount ?? 0;
            const historyStatus = failedCount > 0 ? 'failed' : 'success';
            (0, taskHistory_js_1.addTaskRecord)({
                id: `sync-fix-${Date.now()}`,
                label: '同步并修复',
                kind: 'sync-fix',
                source: 'vectahub',
                status: historyStatus,
                command: `同步 ${pendingCount} 个: 完成 ${completedNow}, 失败 ${failedCount}, 剩余 ${pendingAfter}`,
                startedAt,
                endedAt,
                errorMessage: failedCount > 0 ? `${failedCount} 个任务处理失败` : undefined
            });
            (0, output_js_1.logToOutput)(`[syncAndFixCi] 批量修复完成: 已处理 ${completedNow}, 失败 ${failedCount}, 剩余 ${pendingAfter}`);
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
                ? `同步并修复完成: ${parts.join(' / ')}`
                : '✅ 同步并修复完成';
            if (failedCount > 0 || pendingAfter > 0 || needsConfirmCount > 0) {
                vscode.window.showWarningMessage(msg);
            }
            else {
                vscode.window.showInformationMessage(msg);
            }
        });
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=syncAndFixCi.js.map