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
exports.detectProjectTasks = detectProjectTasks;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const packageManager_js_1 = require("./packageManager.js");
const packageScripts_js_1 = require("./packageScripts.js");
async function detectProjectTasks() {
    const activeEditor = vscode.window.activeTextEditor;
    let workspaceFolder;
    if (activeEditor) {
        workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
    }
    if (!workspaceFolder) {
        workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }
    if (!workspaceFolder) {
        return [];
    }
    const tasks = [];
    const packageJsonPath = path.join(workspaceFolder, 'package.json');
    let pkg;
    if (fs.existsSync(packageJsonPath)) {
        try {
            pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        }
        catch {
            // ignore
        }
    }
    const pm = (0, packageManager_js_1.detectPackageManager)(workspaceFolder);
    if (fs.existsSync(path.join(workspaceFolder, '.git'))) {
        tasks.push({
            id: 'git-status',
            kind: 'git-status',
            label: 'Git 状态 (Status)',
            source: 'git',
            available: true,
            command: { cli: 'git', args: ['status'] }
        });
    }
    const pkgTasks = (0, packageScripts_js_1.detectPackageTasks)(workspaceFolder, pm, pkg);
    tasks.push(...pkgTasks);
    tasks.push({
        id: 'vh-doctor',
        kind: 'doctor',
        label: '环境检查 (Doctor)',
        source: 'vectahub',
        available: true,
        command: { cli: 'vectahub', args: ['doctor'] }
    });
    return tasks;
}
//# sourceMappingURL=detector.js.map