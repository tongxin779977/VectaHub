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
exports.registerListToolsCommand = registerListToolsCommand;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const output_js_1 = require("../ui/output.js");
function registerListToolsCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.listTools', async () => {
        (0, output_js_1.logToOutput)('正在列出已注册的 CLI 工具...');
        const result = await (0, adapter_js_1.runCli)(['tools', 'list', '--json']);
        if (result.ok && result.data) {
            (0, output_js_1.logToOutput)('已注册工具:');
            result.data.tools.forEach((tool) => {
                (0, output_js_1.logToOutput)(`- ${tool.name}: ${tool.description} (命令数: ${tool.commandCount}, 危险命令数: ${tool.dangerousCount})`);
            });
            vscode.window.showInformationMessage(`发现 ${result.data.tools.length} 个已注册的 CLI 工具。`);
        }
        else {
            (0, output_js_1.logToOutput)(`列出工具失败: ${result.error?.message || result.stderr}`, 'error');
            vscode.window.showErrorMessage('未能成功列出 CLI 工具。');
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=listTools.js.map