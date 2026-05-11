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
exports.registerDocTaskCommands = registerDocTaskCommands;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
const output_js_1 = require("../ui/output.js");
function registerDocTaskCommands(context, tasksProvider) {
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.selectDocFile', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                '文档文件': ['md', 'txt', 'rst', 'adoc'],
                '所有文件': ['*']
            },
            title: '选择开发文档'
        });
        if (!uris || uris.length === 0)
            return;
        const filePath = uris[0].fsPath;
        tasksProvider.setSelectedDocPath(filePath);
        tasksProvider.setDocTasks([]);
        tasksProvider.setIsDocParsing(false);
        tasksProvider.refresh();
        (0, output_js_1.logToOutput)(`已选择文档: ${filePath}`);
        await vscode.commands.executeCommand('vectahubTasks.parseDocTasks');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.parseDocTasks', async () => {
        const docPath = tasksProvider.getSelectedDocPath();
        if (!docPath) {
            vscode.window.showWarningMessage('请先选择文档文件');
            return;
        }
        tasksProvider.setIsDocParsing(true);
        tasksProvider.refresh();
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在解析文档任务...',
                cancellable: false
            }, async () => {
                const result = await (0, adapter_js_1.runCli)(['parse-doc', docPath, '--json']);
                if (result.ok && result.data?.tasks) {
                    tasksProvider.setDocTasks(result.data.tasks);
                    (0, output_js_1.logToOutput)(`解析完成，共 ${result.data.tasks.length} 个任务`);
                    vscode.window.showInformationMessage(`解析完成，共 ${result.data.tasks.length} 个任务`);
                }
                else {
                    const errMsg = result.data?.error || result.error?.message || '解析失败';
                    (0, output_js_1.logToOutput)(`解析失败: ${errMsg}`, 'error');
                    vscode.window.showErrorMessage(`解析失败: ${errMsg}`);
                }
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            (0, output_js_1.logToOutput)(`解析异常: ${msg}`, 'error');
            vscode.window.showErrorMessage(`解析异常: ${msg}`);
        }
        finally {
            tasksProvider.setIsDocParsing(false);
            tasksProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.selectAgentCli', async () => {
        const result = await (0, adapter_js_1.runCli)(['tools', 'agents', '--json']);
        const items = [];
        if (result.ok && result.data?.agents) {
            const installedAgents = result.data.agents.filter(a => a.installed);
            if (installedAgents.length === 0) {
                vscode.window.showWarningMessage('未检测到已安装的 AI Agent CLI，请先安装 gemini/claude/codex/aider 等工具');
            }
            for (const agent of installedAgents) {
                items.push({
                    label: agent.name,
                    description: agent.version
                });
            }
        }
        items.push({
            label: '手动输入',
            description: '输入自定义 Agent CLI 名称'
        });
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择 Agent CLI 执行器',
            title: '选择执行文档任务的 Agent CLI'
        });
        if (!selected)
            return;
        if (selected.label === '手动输入') {
            const customName = await vscode.window.showInputBox({
                prompt: '输入 Agent CLI 名称',
                placeHolder: 'aider'
            });
            if (customName) {
                tasksProvider.setSelectedAgentCli(customName);
                tasksProvider.refresh();
            }
        }
        else {
            tasksProvider.setSelectedAgentCli(selected.label);
            tasksProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.runDocTask', async (task) => {
        const docPath = tasksProvider.getSelectedDocPath();
        let agentCli = tasksProvider.getSelectedAgentCli();
        if (!agentCli) {
            await vscode.commands.executeCommand('vectahubTasks.selectAgentCli');
            agentCli = tasksProvider.getSelectedAgentCli();
            if (!agentCli) {
                vscode.window.showWarningMessage('请先选择 Agent CLI 执行器');
                return;
            }
        }
        const args = [
            'run-task',
            '--tool', agentCli,
            '--task-id', task.id,
            '--task-label', task.label,
            '--json'
        ];
        if (docPath) {
            args.push('--doc', docPath);
        }
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在执行任务 ${task.id}: ${task.label}`,
                cancellable: true
            }, async (_progress, token) => {
                (0, output_js_1.logToOutput)(`开始执行任务: ${task.id} - ${task.label} (工具: ${agentCli})`);
                const result = await (0, adapter_js_1.runCli)(args, {
                    timeout: 600000,
                    token
                });
                if (result.ok) {
                    const output = result.data?.output || '';
                    (0, output_js_1.logToOutput)(`任务 ${task.id} 执行成功`);
                    if (output) {
                        (0, output_js_1.logToOutput)(output);
                    }
                    vscode.window.showInformationMessage(`任务 ${task.id} 执行成功`);
                }
                else {
                    const errMsg = result.data?.error || result.data?.output || result.error?.message || '执行失败';
                    (0, output_js_1.logToOutput)(`任务 ${task.id} 执行失败: ${errMsg}`, 'error');
                    vscode.window.showErrorMessage(`任务 ${task.id} 执行失败: ${errMsg}`);
                }
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            (0, output_js_1.logToOutput)(`任务 ${task.id} 执行异常: ${msg}`, 'error');
            vscode.window.showErrorMessage(`任务执行异常: ${msg}`);
        }
    }));
}
//# sourceMappingURL=runDocTasks.js.map