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
exports.registerRunIntentCommand = registerRunIntentCommand;
const vscode = __importStar(require("vscode"));
const planBuilder_js_1 = require("../execution/planBuilder.js");
const planRunner_js_1 = require("../execution/planRunner.js");
const output_js_1 = require("../ui/output.js");
const settings_js_1 = require("../config/settings.js");
function registerRunIntentCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.runIntent', async (intent) => {
        const input = intent || await vscode.window.showInputBox({
            prompt: '输入自然语言意图',
            placeHolder: '查看 git 状态',
            ignoreFocusOut: true,
        });
        if (!input) {
            vscode.window.showWarningMessage('已取消输入');
            return;
        }
        const plan = planBuilder_js_1.PlanBuilder.buildIntentPlan(input);
        const runner = new planRunner_js_1.PlanRunner((0, output_js_1.getOutputChannel)());
        if ((0, settings_js_1.getPreviewBeforeRun)()) {
            (0, output_js_1.logToOutput)(`[runIntent] previewBeforeRun=true, 先执行 dry-run: ${input}`);
            try {
                const previewResult = await runner.preview(plan);
                if (!previewResult || previewResult.ok === false) {
                    const errMsg = previewResult?.error?.message || '预览失败';
                    vscode.window.showErrorMessage(`预览失败: ${errMsg}`);
                    return;
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`预览失败: ${msg}`);
                return;
            }
            const confirm = await vscode.window.showInformationMessage(`预览通过，确认执行: "${input}"?`, { modal: true }, '确认执行');
            if (confirm !== '确认执行')
                return;
        }
        await runner.run(plan);
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=runIntent.js.map