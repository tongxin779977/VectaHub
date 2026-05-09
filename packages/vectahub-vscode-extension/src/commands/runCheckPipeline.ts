import * as vscode from 'vscode';
import { getOutputChannel } from '../ui/output.js';
import { PlanRunner } from '../execution/planRunner.js';
import { detectProjectTasks } from '../project/detector.js';
import { createCheckPipeline } from '../execution/devPipeline.js';
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

export function registerRunCheckPipelineCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runCheckPipeline', async () => {
    const tasks = await detectProjectTasks();
    const result = createCheckPipeline(tasks);

    if (result.plans.length === 0) {
      const skipped = result.skipped.length > 0 ? `跳过: ${result.skipped.join(', ')}` : '';
      vscode.window.showWarningMessage(`无可执行的质量检查任务。${skipped}`);
      return;
    }

    if (result.skipped.length > 0) {
      vscode.window.showInformationMessage(`跳过不可用任务: ${result.skipped.join(', ')}`);
    }

    const startedAt = new Date();
    let status: 'success' | 'failed' | 'cancelled' = 'success';

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'VectaHub 一键检查全部...',
      cancellable: true
    }, async (_progress, token) => {
      const runner = new PlanRunner(getOutputChannel());
      try {
        await runPlansSequentially(result.plans, runner, token);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('cancelled')) {
          status = 'cancelled';
          vscode.window.showInformationMessage('⏸ 一键检查已取消');
        } else {
          status = 'failed';
          vscode.window.showErrorMessage(`❌ 检查链在某步失败: ${message}`);
        }
      }
    });

    const endedAt = new Date();
    const summary = `检查链: ${result.included.map(t => t.label).join(' → ')}`;
    addTaskRecord({
      id: `check-pipeline-${Date.now()}`,
      label: '一键检查全部',
      kind: 'check-pipeline',
      source: 'vectahub',
      status,
      command: summary,
      startedAt,
      endedAt
    });
    tasksProvider.refresh();

    if (status === 'success') {
      vscode.window.showInformationMessage('✅ 一键检查全部完成');
    }
  });
  context.subscriptions.push(disposable);
}
