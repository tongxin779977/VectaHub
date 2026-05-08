import * as vscode from 'vscode';
import { ProjectTask } from '../project/taskModel.js';
import { logToOutput } from '../ui/output.js';
import { createProjectTaskPlan } from '../execution/planBuilder.js';
import { runPlan } from '../execution/planRunner.js';
import { renderPlanCommand } from '../execution/planRenderer.js';
import { addTaskRecord } from '../project/taskHistory.js';
import { TasksViewProvider } from '../views/tasksView.js';

export function registerRunProjectTaskCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runProjectTask', async (task: ProjectTask) => {
    logToOutput(`[DEBUG] runProjectTask 开始执行，task: ${task.label}, kind: ${task.kind}`);
    const startedAt = new Date();

    const plan = createProjectTaskPlan(task);
    if (!plan) {
      vscode.window.showWarningMessage('该任务缺少可执行命令。');
      return;
    }

    const ok = await runPlan(plan);
    const endedAt = new Date();

    addTaskRecord({
      id: `task-${Date.now()}`,
      label: task.label,
      kind: task.kind,
      source: task.source,
      status: ok ? 'success' : 'cancelled',
      command: renderPlanCommand(plan),
      startedAt,
      endedAt
    });
    tasksProvider.refresh();
  });
  context.subscriptions.push(disposable);
}