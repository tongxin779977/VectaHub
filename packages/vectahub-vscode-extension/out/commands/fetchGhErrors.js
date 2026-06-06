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
exports.registerFetchGhErrorsCommand = registerFetchGhErrorsCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const readiness_js_1 = require("../cli/readiness.js");
const output_js_1 = require("../ui/output.js");
function extractPendingCount(workflowResult, queue) {
    if (workflowResult?.summary?.pendingCount !== undefined) {
        return workflowResult.summary.pendingCount;
    }
    return queue.tasks.filter(t => t.status === 'pending' || t.status === 'needs-confirmation').length;
}
function registerFetchGhErrorsCommand(context, tasksProvider) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.fetchGhErrors', async () => {
        const ready = await (0, readiness_js_1.waitForCliReady)();
        if (!ready)
            return;
        (0, output_js_1.logToOutput)('[fetchGhErrors] 开始拉取 GitHub Actions 错误');
        const startedAt = new Date();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "VectaHub: 正在同步 GitHub Actions 错误...",
            cancellable: true
        }, async (progress, token) => {
            const cwd = (0, adapter_js_1.getActiveWorkspaceFolder)();
            const result = await (0, adapter_js_1.runCli)(['run', '-f', 'sys:fetch-gh-actions-errors', '--json'], { token, cwd, timeout: 120000 });
            if (!result.ok) {
                if (result.error?.code === 'CANCELLED') {
                    (0, output_js_1.logToOutput)('[fetchGhErrors] 拉取已由用户取消');
                    vscode.window.showInformationMessage('拉取已取消');
                }
                else {
                    const errMsg = result.error?.message || result.stderr || '未知错误';
                    (0, output_js_1.logToOutput)(`[fetchGhErrors] 拉取失败: ${errMsg}`, 'error');
                    vscode.window.showErrorMessage(`同步失败: ${errMsg}`, '查看详情').then(choice => {
                        if (choice === '查看详情') {
                            vscode.commands.executeCommand('workbench.action.output.toggleOutput');
                        }
                    });
                }
                return;
            }
            const endedAt = new Date();
            const queue = tasksProvider.readDiagnosticQueue();
            const workflowData = result.data;
            const pendingCount = extractPendingCount(workflowData, queue);
            if (workflowData?.summary) {
                const s = workflowData.summary;
                (0, output_js_1.logToOutput)(`[fetchGhErrors] 拉取完成，耗时 ${endedAt.getTime() - startedAt.getTime()}ms，summary: fetched=${s.fetchedCount}, added=${s.addedCount}, pending=${s.pendingCount}`);
            }
            else {
                (0, output_js_1.logToOutput)(`[fetchGhErrors] 拉取完成，耗时 ${endedAt.getTime() - startedAt.getTime()}ms，队列 pending: ${pendingCount}`);
            }
            tasksProvider.refresh();
            if (pendingCount > 0) {
                vscode.window.showWarningMessage(`新发现 ${pendingCount} 个待处理项`, '立即处理队列').then(choice => {
                    if (choice === '立即处理队列') {
                        vscode.commands.executeCommand('vectahubTasks.processAllQueue');
                    }
                });
            }
            else {
                vscode.window.showInformationMessage('✅ 同步完成，队列为空');
            }
        });
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=fetchGhErrors.js.map