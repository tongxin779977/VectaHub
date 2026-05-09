import * as vscode from 'vscode';
import { LongRunningTaskManager } from '../cli/longRunningTaskManager.js';
import { TasksViewProvider } from '../views/tasksView.js';
import { TaskTreeItem } from '../views/treeItems.js';

export function registerStopRunningTaskCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const lrt = LongRunningTaskManager.getInstance();

  const disposable = vscode.commands.registerCommand('vectahubTasks.stopRunningTask', async (arg?: string | TaskTreeItem) => {
    let resolvedId: string | undefined;

    if (typeof arg === 'string') {
      resolvedId = arg;
    } else if (arg && typeof arg === 'object' && 'taskId' in arg) {
      resolvedId = (arg as TaskTreeItem).taskId;
    }

    if (!resolvedId) {
      const running = lrt.getAllRunning();
      if (running.length === 0) {
        vscode.window.showInformationMessage('当前没有运行中的长驻任务。');
        return;
      }

      if (running.length === 1) {
        lrt.stop(running[0].id);
        tasksProvider.refresh();
        vscode.window.showInformationMessage(`⏹ ${running[0].label} 已停止`);
        return;
      }

      const items = running.map(t => ({
        label: t.label,
        description: t.kind,
        taskId: t.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要停止的任务'
      });

      if (selected) {
        lrt.stop(selected.taskId);
        tasksProvider.refresh();
        vscode.window.showInformationMessage(`⏹ ${selected.label} 已停止`);
      }
      return;
    }

    const stopped = lrt.stop(resolvedId);
    if (stopped) {
      tasksProvider.refresh();
      vscode.window.showInformationMessage('任务已停止');
    } else {
      vscode.window.showWarningMessage('该任务当前未在运行。');
    }
  });

  context.subscriptions.push(disposable);
}
