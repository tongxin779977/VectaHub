import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';

export function registerListToolsCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.listTools', async () => {
    logToOutput('正在列出已注册的 CLI 工具...');
    
    const result = await runCli<any>(['tools', 'list', '--json']);
    
    if (result.ok && result.data) {
      logToOutput('已注册工具:');
      result.data.tools.forEach((tool: any) => {
        logToOutput(`- ${tool.name}: ${tool.description} (命令数: ${tool.commandCount}, 危险命令数: ${tool.dangerousCount})`);
      });
      vscode.window.showInformationMessage(`发现 ${result.data.tools.length} 个已注册的 CLI 工具。`);
    } else {
      logToOutput(`列出工具失败: ${result.error?.message || result.stderr}`, 'error');
      vscode.window.showErrorMessage('未能成功列出 CLI 工具。');
    }
  });
  context.subscriptions.push(disposable);
}
