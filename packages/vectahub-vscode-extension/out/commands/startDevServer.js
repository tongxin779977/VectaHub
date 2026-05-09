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
exports.registerStartDevServerCommand = registerStartDevServerCommand;
const vscode = __importStar(require("vscode"));
const longRunningTaskManager_js_1 = require("../cli/longRunningTaskManager.js");
function registerStartDevServerCommand(context, tasksProvider) {
    const lrt = longRunningTaskManager_js_1.LongRunningTaskManager.getInstance();
    const disposable = vscode.commands.registerCommand('vectahubTasks.startDevServer', async (task) => {
        if (!task.command) {
            vscode.window.showWarningMessage('该任务缺少可执行命令。');
            return;
        }
        if (lrt.isRunning(task.id)) {
            const choice = await vscode.window.showInformationMessage(`"${task.label}" 已在运行中`, '查看输出', '重启', '停止');
            if (choice === '查看输出') {
                lrt.focusOutput(task.id);
            }
            else if (choice === '重启') {
                await lrt.restart(task, getCwd());
                tasksProvider.refresh();
                vscode.window.showInformationMessage(`🔄 ${task.label} 已重启`);
            }
            else if (choice === '停止') {
                lrt.stop(task.id);
                tasksProvider.refresh();
                vscode.window.showInformationMessage(`⏹ ${task.label} 已停止`);
            }
            return;
        }
        try {
            lrt.start(task, getCwd());
            tasksProvider.refresh();
            vscode.window.showInformationMessage(`🚀 ${task.label} 已启动`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`启动失败: ${msg}`);
        }
    });
    context.subscriptions.push(disposable);
}
function getCwd() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
//# sourceMappingURL=startDevServer.js.map