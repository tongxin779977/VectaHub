import * as vscode from 'vscode';
import { ProjectTask } from '../project/taskModel.js';
import { logToOutput, getOutputChannel } from '../ui/output.js';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { addTaskRecord } from '../project/taskHistory.js';
import { TasksViewProvider } from '../views/tasksView.js';

export function registerRunProjectTaskCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runProjectTask', async (task: ProjectTask) => {
    logToOutput(`[DEBUG] runProjectTask 开始执行，task: ${task.label}`);
    const startedAt = new Date();

    const plan = PlanBuilder.createProjectTaskPlan(task as any);
    if (!plan) {
      vscode.window.showWarningMessage('该任务缺少可执行命令。');
      return;
    }

    const runner = new PlanRunner(getOutputChannel());
    await runner.run(plan);
    const endedAt = new Date();

    addTaskRecord({
      id: `task-${Date.now()}`,
      label: task.label,
      kind: task.kind,
      source: task.source,
      status: 'success', // PlanRunner handles failure UI, history shows triggered
      command: task.command ? `${task.command.cli} ${task.command.args.join(' ')}` : undefined,
      startedAt,
      endedAt
    });
    tasksProvider.refresh();
  });
  context.subscriptions.push(disposable);
}