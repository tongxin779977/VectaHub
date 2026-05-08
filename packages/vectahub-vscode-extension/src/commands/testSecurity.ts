import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';

export function registerTestSecurityCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.testSecurity', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const text = selection ? editor.document.getText(selection) : '';
    
    const command = text || await vscode.window.showInputBox({
      prompt: '输入要进行安全合规性测试的命令',
      placeHolder: '例如: rm -rf /'
    });

    if (!command) return;

    logToOutput(`正在进行安全测试，命令: "${command}"`);
    
    const result = await runCli<any>(['security', 'test', '--json', command]);
    
    if (result.ok && result.data) {
      if (result.data.isDangerous) {
        vscode.window.showErrorMessage(`🚨 危险命令! 风险等级: ${result.data.severity}. 命中规则: ${result.data.rule?.name}`);
        logToOutput(`安全警报: ${result.data.rule?.name} (风险: ${result.data.severity})`, 'warn');
      } else {
        vscode.window.showInformationMessage('✅ 命令安全合规。');
        logToOutput('安全检查: 通过。');
      }
    } else {
      logToOutput(`安全测试失败: ${result.error?.message || result.stderr}`, 'error');
    }
  });
  context.subscriptions.push(disposable);
}
