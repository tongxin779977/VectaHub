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
function registerProcessAllQueueCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.processAllQueue', async () => {
        const confirm = await vscode.window.showWarningMessage('确定要启动批量修复流程吗？系统将逐一处理诊断队列中的所有任务。', { modal: true }, '开始处理');
        if (confirm === '开始处理') {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "VectaHub 正在进行批量诊断修复...",
                cancellable: true
            }, async (progress, token) => {
                const result = await (0, adapter_js_1.runCli)(['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed'], { token });
                if (result.ok) {
                    vscode.window.showInformationMessage('✅ 批量诊断任务处理完成');
                }
                else if (result.error?.code === 'CANCELLED') {
                    vscode.window.showInformationMessage('⏸ 批量处理已由用户中止');
                }
                else {
                    vscode.window.showErrorMessage(`❌ 批量处理中断: ${result.error?.message || '未知错误'}`);
                }
            });
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=processAllQueue.js.map