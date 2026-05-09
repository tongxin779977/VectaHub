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
exports.registerTestSecurityCommand = registerTestSecurityCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const output_js_1 = require("../ui/output.js");
function registerTestSecurityCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.testSecurity', async () => {
        const editor = vscode.window.activeTextEditor;
        const selection = editor?.selection;
        const text = selection ? editor.document.getText(selection) : '';
        const command = text || await vscode.window.showInputBox({
            prompt: '输入要进行安全合规性测试的命令',
            placeHolder: '例如: rm -rf /'
        });
        if (!command)
            return;
        (0, output_js_1.logToOutput)(`正在进行安全测试，命令: "${command}"`);
        const result = await (0, adapter_js_1.runCli)(['security', 'test', '--json', command]);
        if (result.ok && result.data) {
            if (result.data.isDangerous) {
                vscode.window.showErrorMessage(`🚨 危险命令! 风险等级: ${result.data.severity}. 命中规则: ${result.data.rule?.name}`);
                (0, output_js_1.logToOutput)(`安全警报: ${result.data.rule?.name} (风险: ${result.data.severity})`, 'warn');
            }
            else {
                vscode.window.showInformationMessage('✅ 命令安全合规。');
                (0, output_js_1.logToOutput)('安全检查: 通过。');
            }
        }
        else {
            (0, output_js_1.logToOutput)(`安全测试失败: ${result.error?.message || result.stderr}`, 'error');
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=testSecurity.js.map