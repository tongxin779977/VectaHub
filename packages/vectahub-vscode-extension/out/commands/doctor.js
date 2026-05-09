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
exports.registerDoctorCommand = registerDoctorCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const output_js_1 = require("../ui/output.js");
const statusBar_js_1 = require("../ui/statusBar.js");
function registerDoctorCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.doctor', async () => {
        (0, output_js_1.logToOutput)('正在运行 VectaHub 环境检查 (Doctor)...');
        (0, statusBar_js_1.updateStatusBar)('Running');
        const result = await (0, adapter_js_1.runCli)(['doctor', '--json']);
        if (result.ok && result.data) {
            (0, output_js_1.logToOutput)('Doctor 检查摘要:');
            (0, output_js_1.logToOutput)(`- 通过: ${result.data.summary.passed}`);
            (0, output_js_1.logToOutput)(`- 警告: ${result.data.summary.warnings}`);
            (0, output_js_1.logToOutput)(`- 失败: ${result.data.summary.failed}`);
            if (result.data.summary.failed === 0) {
                vscode.window.showInformationMessage('VectaHub Doctor: 所有检查都已通过！');
                (0, statusBar_js_1.updateStatusBar)('Ready');
            }
            else {
                vscode.window.showErrorMessage(`VectaHub Doctor: 有 ${result.data.summary.failed} 项检查失败。`);
                (0, statusBar_js_1.updateStatusBar)('Failed');
            }
        }
        else {
            (0, output_js_1.logToOutput)(`Doctor 运行失败: ${result.error?.message || result.stderr}`, 'error');
            vscode.window.showErrorMessage('VectaHub Doctor 未能成功运行。');
            (0, statusBar_js_1.updateStatusBar)('Failed');
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=doctor.js.map