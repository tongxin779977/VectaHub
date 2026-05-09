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
function registerFetchGhErrorsCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.fetchGhErrors', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "正在同步 GitHub Actions 失败记录...",
            cancellable: false
        }, async (progress) => {
            const result = await (0, adapter_js_1.runCli)(['run', '-f', 'sys:fetch-gh-actions-errors', '--mode', 'relaxed']);
            if (result.ok) {
                vscode.window.showInformationMessage('✅ GitHub 错误记录同步完成');
            }
            else {
                vscode.window.showErrorMessage(`❌ 同步失败: ${result.error?.message || '未知错误'}`);
            }
        });
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=fetchGhErrors.js.map