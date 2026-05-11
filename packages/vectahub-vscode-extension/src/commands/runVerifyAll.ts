import * as vscode from 'vscode';
import { getOutputChannel } from '../ui/output.js';
import { PlanRunner } from '../execution/planRunner.js';
import { detectProjectTasks } from '../project/detector.js';
import { createVerifyPipeline } from '../execution/devPipeline.js';
import { addTaskRecord } from '../project/taskHistory.js';
import { TasksViewProvider } from '../views/tasksView.js';
import { ExecutionPlan } from '../execution/plan.js';

async function runPlansSequentially(
  plans: ExecutionPlan[],
  runner: PlanRunner,
  token: vscode.CancellationToken
): Promise<void> {
  for (const plan of plans) {
    if (token.isCancellationRequested) {
      throw new Error('cancelled');
    }
    await runner.run(plan);
  }
}

export function registerRunVerifyAllCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runVerifyAll', async () => {
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

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'VectaHub 一键验证全部...',
      cancellable: true
    }, async (_progress, token) => {
      const runner = new PlanRunner(getOutputChannel());
      try {
        await runPlansSequentially(result.plans, runner, token);
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
  });
  context.subscriptions.push(disposable);
}
