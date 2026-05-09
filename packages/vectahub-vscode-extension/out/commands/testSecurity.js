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
const readiness_js_1 = require("../cli/readiness.js");
const dangerDetection_js_1 = require("../cli/dangerDetection.js");
const SECURITY_TEST_TIMEOUT = 15000;
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
        const dangerousMatch = (0, dangerDetection_js_1.getDangerousMatch)(command);
        if (dangerousMatch) {
            (0, output_js_1.logToOutput)(`[testSecurity] 本地危险检测命中: ${dangerousMatch}`);
            vscode.window.showErrorMessage(`🚨 危险命令! 命中本地规则: "${dangerousMatch}"`);
            return;
        }
        const ready = await (0, readiness_js_1.waitForCliReady)();
        if (!ready) {
            (0, output_js_1.logToOutput)('[testSecurity] CLI 未就绪，使用本地检测结果');
            if ((0, dangerDetection_js_1.isDangerousCommand)(command)) {
                vscode.window.showErrorMessage('🚨 命令被本地安全规则标记为危险');
            }
            else {
                vscode.window.showInformationMessage('⚠️ CLI 未就绪，本地检测未发现危险模式');
            }
            return;
        }
        (0, output_js_1.logToOutput)(`[testSecurity] 正在进行安全测试，命令: "${command}"`);
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "VectaHub: 正在进行安全检测...",
            cancellable: true
        }, async (progress, token) => {
            const result = await (0, adapter_js_1.runCli)(['security', 'test', '--json', command], { token, timeout: SECURITY_TEST_TIMEOUT });
            if (!result.ok) {
                if (result.error?.code === 'CANCELLED') {
                    (0, output_js_1.logToOutput)('[testSecurity] 安全检测已取消');
                    return;
                }
                const errMsg = result.error?.message || result.stderr || '未知错误';
                (0, output_js_1.logToOutput)(`[testSecurity] CLI 安全检测失败: ${errMsg}，回退到本地检测`, 'warn');
                if ((0, dangerDetection_js_1.isDangerousCommand)(command)) {
                    vscode.window.showErrorMessage('🚨 命令被本地安全规则标记为危险 (CLI 检测失败)');
                }
                else {
                    vscode.window.showWarningMessage(`安全检测异常: ${errMsg}，本地检测未发现危险模式`);
                }
                return;
            }
            if (result.data?.isDangerous) {
                vscode.window.showErrorMessage(`🚨 危险命令! 风险等级: ${result.data.severity}. 命中规则: ${result.data.rule?.name}`);
                (0, output_js_1.logToOutput)(`[testSecurity] 安全警报: ${result.data.rule?.name} (风险: ${result.data.severity})`, 'warn');
            }
            else {
                vscode.window.showInformationMessage('✅ 命令安全合规。');
                (0, output_js_1.logToOutput)('[testSecurity] 安全检查: 通过。');
            }
        });
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=testSecurity.js.map