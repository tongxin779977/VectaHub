import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';
import { previewIntent } from './previewIntent.js';

export function registerRunIntentCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runIntent', async (intent?: string) => {
    // 1. 强制预览
    const preview = await previewIntent(intent);
    if (!preview || !preview.ok) return;

    // 2. 确认执行
    const stepList = preview.steps.map(s => `${s.cli} ${s.args.join(' ')}`).join('\n');
    const confirm = await vscode.window.showWarningMessage(
      `确认执行以下计划命令?\n\n${stepList}`,
      { modal: true },
      '确认执行',
      '打开终端手动执行'
    );

    if (confirm === '确认执行') {
      logToOutput(`Running Intent: "${preview.intent}"`);
      updateStatusBar('Running');
      
      const result = await runCli<any>(['run', '--json', '--mode', 'strict', preview.intent]);
      
      if (result.ok) {
        logToOutput('Execution Success.');
        vscode.window.showInformationMessage('任务执行成功！');
        updateStatusBar('Ready');
      } else {
        logToOutput(`Execution Failed: ${result.error?.message || result.stderr}`, 'error');
        vscode.window.showErrorMessage('任务执行失败，请查看输出面板。');
        updateStatusBar('Failed');
      }
    } else if (confirm === '打开终端手动执行') {
      const terminal = vscode.window.createTerminal('VectaHub Run');
      terminal.show();
      terminal.sendText(`vectahub run "${preview.intent}"`);
    }
  });
  context.subscriptions.push(disposable);
}
