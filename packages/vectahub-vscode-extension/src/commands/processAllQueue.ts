import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { TasksViewProvider } from '../views/tasksView.js';

export function registerProcessAllQueueCommand(context: vscode.ExtensionContext, tasksProvider?: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.processAllQueue', async () => {
    const confirm = await vscode.window.showWarningMessage(
      '确定要启动批量修复流程吗？系统将逐一处理诊断队列中的所有任务。',
      { modal: true },
      '开始处理'
    );

    if (confirm === '开始处理') {
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "VectaHub 正在进行批量诊断修复...",
        cancellable: true
      }, async (progress, token) => {
        const result = await runCli(['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed'], { token });
        tasksProvider?.refresh();
        if (result.ok) {
          vscode.window.showInformationMessage('✅ 批量诊断任务处理完成');
        } else if (result.error?.code === 'CANCELLED') {
          vscode.window.showInformationMessage('⏸ 批量处理已由用户中止');
        } else {
          vscode.window.showErrorMessage(`❌ 批量处理中断: ${result.error?.message || '未知错误'}`);
        }
      });
    }
  });
  context.subscriptions.push(disposable);
}
