import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';

export function registerTestSecurityCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.testSecurity', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const text = selection ? editor.document.getText(selection) : '';
    
    const command = text || await vscode.window.showInputBox({
      prompt: '输入要测试安全性的命令',
      placeHolder: 'rm -rf /'
    });

    if (!command) return;

    logToOutput(`Testing Security for command: "${command}"`);
    
    const result = await runCli<any>(['security', 'test', '--json', command]);
    
    if (result.ok && result.data) {
      if (result.data.isDangerous) {
        vscode.window.showErrorMessage(`🚨 DANGEROUS! Severity: ${result.data.severity}. Rule: ${result.data.rule?.name}`);
        logToOutput(`Security Alert: ${result.data.rule?.name} (${result.data.severity})`, 'warn');
      } else {
        vscode.window.showInformationMessage('✅ Command is safe.');
        logToOutput('Security Check: Safe.');
      }
    } else {
      logToOutput(`Security test failed: ${result.error?.message || result.stderr}`, 'error');
    }
  });
  context.subscriptions.push(disposable);
}
