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
exports.registerInstallCliCommand = registerInstallCliCommand;
const vscode = __importStar(require("vscode"));
function registerInstallCliCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.installCli', () => {
        const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
        let installCommand;
        let message;
        let cwd;
        if (isDevelopment) {
            // 开发环境：使用本地链接命令
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            cwd = workspaceFolder;
            installCommand = 'npm install -g .';
            message = '请在终端中运行此命令以链接本地 CLI。确保当前目录是项目根目录。';
        }
        else {
            // 生产环境：使用 npm 全局安装
            installCommand = 'npm install -g vectahub';
            message = '请在终端中运行命令以安装 VectaHub CLI。';
        }
        const terminalOptions = {
            name: 'VectaHub 安装',
            cwd: cwd
        };
        const terminal = vscode.window.createTerminal(terminalOptions);
        terminal.show();
        terminal.sendText(installCommand, false);
        vscode.window.showInformationMessage(message);
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=installCli.js.map