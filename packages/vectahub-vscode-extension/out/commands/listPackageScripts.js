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
exports.registerListPackageScriptsCommand = registerListPackageScriptsCommand;
const vscode = __importStar(require("vscode"));
const packageScripts_js_1 = require("../project/packageScripts.js");
const packageManager_js_1 = require("../project/packageManager.js");
const output_js_1 = require("../ui/output.js");
function registerListPackageScriptsCommand(context) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.listPackageScripts', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder)
            return;
        const pm = (0, packageManager_js_1.detectPackageManager)(workspaceFolder);
        const scripts = (0, packageScripts_js_1.getAllPackageScripts)(workspaceFolder, pm);
        if (scripts.length === 0) {
            vscode.window.showInformationMessage('在 package.json 中未找到任何脚本。');
            return;
        }
        const items = scripts.map(s => ({
            label: s.label,
            description: s.description,
            task: s
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要运行的项目脚本',
            matchOnDescription: true
        });
        if (selected) {
            (0, output_js_1.logToOutput)(`Selected script: ${selected.label}`);
            vscode.commands.executeCommand('vectahubTasks.runProjectTask', selected.task);
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=listPackageScripts.js.map