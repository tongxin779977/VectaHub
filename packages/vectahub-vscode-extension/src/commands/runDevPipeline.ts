import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getOutputChannel } from '../ui/output.js';
import { PlanRunner } from '../execution/planRunner.js';
import { detectProjectTasks } from '../project/detector.js';
import { createDevPipeline } from '../execution/devPipeline.js';
import { PlanBuilder } from '../execution/planBuilder.js';
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

function hasNodeModules(): boolean {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return true;
  return fs.existsSync(path.join(workspaceFolder, 'node_modules'));
}

export function registerRunDevPipelineCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runDevPipeline', async () => {
    const tasks = await detectProjectTasks();
    const result = createDevPipeline(tasks);

    if (result.plans.length === 0) {
      const skipped = result.skipped.length > 0 ? `跳过: ${result.skipped.join(', ')}` : '';
      vscode.window.showWarningMessage(`无可执行的开发任务链。${skipped}`);
      return;
    }

    const runner = new PlanRunner(getOutputChannel());

    if (!hasNodeModules()) {
      const installTask = tasks.find(t => t.kind === 'install');
      if (installTask) {
        const choice = await vscode.window.showWarningMessage(
          '未检测到 node_modules 目录，是否先执行 install？',
          { modal: true },
          '先 install',
          '跳过继续'
        );
        if (choice === '先 install') {
          const installPlan = PlanBuilder.createProjectTaskPlan(installTask);
          if (installPlan) {
            try {
              await runner.run(installPlan);
            } catch {
              vscode.window.showErrorMessage('❌ install 失败，开发任务链已终止');
              return;
            }
          }
        }
      }
    }

    if (result.skipped.length > 0) {
      vscode.window.showInformationMessage(`跳过不可用任务: ${result.skipped.join(', ')}`);
    }

    const startedAt = new Date();
    let status: 'success' | 'failed' | 'cancelled' = 'success';

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'VectaHub 开发任务链...',
      cancellable: true
    }, async (_progress, token) => {
      try {
        await runPlansSequentially(result.plans, runner, token);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('cancelled')) {
          status = 'cancelled';
          vscode.window.showInformationMessage('⏸ 开发任务链已取消');
        } else {
          status = 'failed';
          vscode.window.showErrorMessage(`❌ 开发任务链在某步失败: ${message}`);
        }
      }
    });

    const endedAt = new Date();
    const summary = `开发链: ${result.included.map(t => t.label).join(' → ')}`;
    addTaskRecord({
      id: `dev-pipeline-${Date.now()}`,
      label: '开发任务链',
      kind: 'dev-pipeline',
      source: 'vectahub',
      status,
      command: summary,
      startedAt,
      endedAt
    });
    tasksProvider.refresh();

    if (status === 'success') {
      vscode.window.showInformationMessage('✅ 开发任务链完成');
    }
  });
  context.subscriptions.push(disposable);
}
