import * as vscode from 'vscode';
import { ProjectTask } from '../project/taskModel.js';
import { LongRunningTaskManager } from '../cli/longRunningTaskManager.js';
import { TasksViewProvider } from '../views/tasksView.js';

export function registerStartDevServerCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const lrt = LongRunningTaskManager.getInstance();

  const disposable = vscode.commands.registerCommand('vectahubTasks.startDevServer', async (task: ProjectTask) => {
    if (!task.command) {
      vscode.window.showWarningMessage('该任务缺少可执行命令。');
      return;
    }

    if (lrt.isRunning(task.id)) {
      const choice = await vscode.window.showInformationMessage(
        `"${task.label}" 已在运行中`,
        '查看输出',
        '重启',
        '停止'
      );

      if (choice === '查看输出') {
        lrt.focusOutput(task.id);
      } else if (choice === '重启') {
        await lrt.restart(task, getCwd());
        tasksProvider.refresh();
        vscode.window.showInformationMessage(`🔄 ${task.label} 已重启`);
      } else if (choice === '停止') {
        lrt.stop(task.id);
        tasksProvider.refresh();
        vscode.window.showInformationMessage(`⏹ ${task.label} 已停止`);
      }
      return;
    }

    try {
      lrt.start(task, getCwd());
      tasksProvider.refresh();
      vscode.window.showInformationMessage(`🚀 ${task.label} 已启动`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`启动失败: ${msg}`);
    }
  });

  context.subscriptions.push(disposable);
}

function getCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
