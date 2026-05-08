import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';

export function registerListToolsCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.listTools', async () => {
    logToOutput('Listing registered CLI tools...');
    
    const result = await runCli<any>(['tools', 'list', '--json']);
    
    if (result.ok && result.data) {
      logToOutput('Registered Tools:');
      result.data.tools.forEach((tool: any) => {
        logToOutput(`- ${tool.name}: ${tool.description} (Commands: ${tool.commandCount}, Dangerous: ${tool.dangerousCount})`);
      });
      vscode.window.showInformationMessage(`Found ${result.data.tools.length} registered tools.`);
    } else {
      logToOutput(`Failed to list tools: ${result.error?.message || result.stderr}`, 'error');
      vscode.window.showErrorMessage('Failed to list CLI tools.');
    }
  });
  context.subscriptions.push(disposable);
}
