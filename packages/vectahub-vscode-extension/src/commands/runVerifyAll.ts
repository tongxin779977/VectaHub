import * as vscode from 'vscode';
import { getOutputChannel } from '../ui/output.js';
import { PlanRunner } from '../execution/planRunner.js';
import { detectProjectTasks } from '../project/detector.js';
import { createVerifyPipeline } from '../execution/devPipeline.js';
import { addTaskRecord } from '../project/taskHistory.js';
import { TasksViewProvider } from '../views/tasksView.js';
import { ExecutionPlan } from '../execution/plan.js';
import { markTaskRunning, markTaskFinished } from './runProjectTask.js';
import { ProjectTask } from '../project/taskModel.js';

async function runPlansSequentially(
  plans: ExecutionPlan[],
  tasks: ProjectTask[],
  runner: PlanRunner,
  token: vscode.CancellationToken,
  tasksProvider: TasksViewProvider
): Promise<void> {
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const task = tasks[i];
    
    if (token.isCancellationRequested) {
      throw new Error('cancelled');
    }
    
    if (task) {
      markTaskRunning(task.id, tasksProvider);
    }
    
    try {
      await runner.run(plan, { silent: true });
    } finally {
      if (task) {
        markTaskFinished(task.id, tasksProvider);
      }
    }
  }
}

export function registerRunVerifyAllCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runVerifyAll', async () => {
    if (tasksProvider.getIsPipelineRunning?.()) {
      vscode.window.showWarningMessage('验证流水线正在运行中...');
      return;
    }

    const tasks = await detectProjectTasks();
    const result = createVerifyPipeline(tasks);

    if (result.plans.length === 0) {
      const skipped = result.skipped.length > 0 ? `跳过: ${result.skipped.join(', ')}` : '';
      vscode.window.showWarningMessage(`无可执行的验证任务。${skipped}`);
      return;
    }

    if (result.skipped.length > 0) {
      vscode.window.showInformationMessage(`跳过不可用任务: ${result.skipped.join(', ')}`);
    }

    const startedAt = new Date();
    let status: 'success' | 'failed' | 'cancelled' = 'success';
    
    tasksProvider.setIsPipelineRunning?.(true);

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'VectaHub 一键验证全部...',
        cancellable: true
      }, async (_progress, token) => {
        const runner = new PlanRunner(getOutputChannel());
        try {
          await runPlansSequentially(result.plans, result.included, runner, token, tasksProvider);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('cancelled')) {
            status = 'cancelled';
            vscode.window.showInformationMessage('⏸ 一键验证已取消');
          } else {
            status = 'failed';
            vscode.window.showErrorMessage(`❌ 验证链在某步失败: ${message}`);
          }
        }
      });
    } finally {
      tasksProvider.setIsPipelineRunning?.(false);
      
      const endedAt = new Date();
      const summary = `验证链: ${result.included.map(t => t.label).join(' → ')}`;
      addTaskRecord({
        id: `verify-pipeline-${Date.now()}`,
        label: '一键验证全部',
        kind: 'verify-pipeline',
        source: 'vectahub',
        status,
        command: summary,
        startedAt,
        endedAt
      });
      tasksProvider.refresh();

      if (status === 'success') {
        vscode.window.showInformationMessage('✅ 一键验证全部完成');
      }
    }
  });
  context.subscriptions.push(disposable);
}
