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
exports.registerStopRunningTaskCommand = registerStopRunningTaskCommand;
const vscode = __importStar(require("vscode"));
const longRunningTaskManager_js_1 = require("../cli/longRunningTaskManager.js");
function registerStopRunningTaskCommand(context, tasksProvider) {
    const lrt = longRunningTaskManager_js_1.LongRunningTaskManager.getInstance();
    const disposable = vscode.commands.registerCommand('vectahubTasks.stopRunningTask', async (arg) => {
        let resolvedId;
        if (typeof arg === 'string') {
            resolvedId = arg;
        }
        else if (arg && typeof arg === 'object' && 'taskId' in arg) {
            resolvedId = arg.taskId;
        }
        if (!resolvedId) {
            const running = lrt.getAllRunning();
            if (running.length === 0) {
                vscode.window.showInformationMessage('当前没有运行中的长驻任务。');
                return;
            }
            if (running.length === 1) {
                lrt.stop(running[0].id);
                tasksProvider.refresh();
                vscode.window.showInformationMessage(`⏹ ${running[0].label} 已停止`);
                return;
            }
            const items = running.map(t => ({
                label: t.label,
                description: t.kind,
                taskId: t.id
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要停止的任务'
            });
            if (selected) {
                lrt.stop(selected.taskId);
                tasksProvider.refresh();
                vscode.window.showInformationMessage(`⏹ ${selected.label} 已停止`);
            }
            return;
        }
        const stopped = lrt.stop(resolvedId);
        if (stopped) {
            tasksProvider.refresh();
            vscode.window.showInformationMessage('任务已停止');
        }
        else {
            vscode.window.showWarningMessage('该任务当前未在运行。');
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=stopRunningTask.js.map