import * as vscode from 'vscode';
import { ProjectTask } from '../project/taskModel.js';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';
import { previewProjectTask, mapKindToIntent } from './previewProjectTask.js';

export function registerRunProjectTaskCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runProjectTask', async (task: ProjectTask) => {
    // 1. 强制预览
    const preview = await previewProjectTask(task);
    if (!preview || !preview.ok) return;

    // 2. 确认执行
    const stepList = preview.steps.map(s => `${s.cli} ${s.args.join(' ')}`).join('\n');
    const confirm = await vscode.window.showWarningMessage(
      `确认执行项目任务: ${task.label}?\n\n计划执行:\n${stepList}`,
      { modal: true },
      '确认执行',
      '打开终端手动执行'
    );

    if (confirm === '确认执行') {
      logToOutput(`Running Project Task: ${task.label}`);
      updateStatusBar('Running');
      
      const intent = mapKindToIntent(task.kind) || preview.intent;
      const result = await runCli<any>(['run', '--json', '--mode', 'strict', intent]);
      
      if (result.ok) {
        logToOutput(`Task "${task.label}" completed successfully.`);
        vscode.window.showInformationMessage(`任务 "${task.label}" 执行成功！`);
        updateStatusBar('Ready');
      } else {
        logToOutput(`Task "${task.label}" failed: ${result.error?.message || result.stderr}`, 'error');
        vscode.window.showErrorMessage('任务执行失败，请查看输出面板。');
        updateStatusBar('Failed');
      }
    } else if (confirm === '打开终端手动执行') {
      const terminal = vscode.window.createTerminal(`VectaHub: ${task.label}`);
      terminal.show();
      const intent = mapKindToIntent(task.kind) || preview.intent;
      terminal.sendText(`vectahub run "${intent}"`, false);
    }
  });
  context.subscriptions.push(disposable);
}