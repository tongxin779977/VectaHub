import * as vscode from 'vscode';
import { TasksViewProvider } from '../views/tasksView.js';
import { runCli, getActiveWorkspaceFolder } from '../cli/adapter.js';
import { waitForCliReady } from '../cli/readiness.js';
import { logToOutput } from '../ui/output.js';
import { QueueSummary } from '../project/diagnosticModel.js';

interface WorkflowResult {
  ok: boolean;
  status?: string;
  summary?: QueueSummary;
  error?: { code?: string; message?: string };
}

function extractPendingCount(workflowResult: WorkflowResult | undefined, queue: { tasks: { status: string }[] }): number {
  if (workflowResult?.summary?.pendingCount !== undefined) {
    return workflowResult.summary.pendingCount;
  }
  return queue.tasks.filter(t => t.status === 'pending' || t.status === 'needs-confirmation').length;
}

export function registerFetchGhErrorsCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.fetchGhErrors', async () => {
    const ready = await waitForCliReady();
    if (!ready) return;

    logToOutput('[fetchGhErrors] 开始拉取 GitHub Actions 错误');
    const startedAt = new Date();

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "VectaHub: 正在同步 GitHub Actions 错误...",
      cancellable: true
    }, async (progress, token) => {
      const cwd = getActiveWorkspaceFolder();
      const result = await runCli<WorkflowResult>(
        ['run', '-f', 'sys:fetch-gh-actions-errors', '--json'],
        { token, cwd, timeout: 120000 }
      );

      if (!result.ok) {
        if (result.error?.code === 'CANCELLED') {
          logToOutput('[fetchGhErrors] 拉取已由用户取消');
          vscode.window.showInformationMessage('拉取已取消');
        } else {
          const errMsg = result.error?.message || result.stderr || '未知错误';
          logToOutput(`[fetchGhErrors] 拉取失败: ${errMsg}`, 'error');
          vscode.window.showErrorMessage(`同步失败: ${errMsg}`, '查看详情').then(choice => {
            if (choice === '查看详情') {
              vscode.commands.executeCommand('workbench.action.output.toggleOutput');
            }
          });
        }
        return;
      }

      const endedAt = new Date();
      const queue = tasksProvider.readDiagnosticQueue();
      const workflowData = result.data as WorkflowResult | undefined;
      const pendingCount = extractPendingCount(workflowData, queue);
      
      if (workflowData?.summary) {
        const s = workflowData.summary;
        logToOutput(`[fetchGhErrors] 拉取完成，耗时 ${endedAt.getTime() - startedAt.getTime()}ms，summary: fetched=${s.fetchedCount}, added=${s.addedCount}, pending=${s.pendingCount}`);
      } else {
        logToOutput(`[fetchGhErrors] 拉取完成，耗时 ${endedAt.getTime() - startedAt.getTime()}ms，队列 pending: ${pendingCount}`);
      }

      tasksProvider.refresh();

      if (pendingCount > 0) {
        vscode.window.showWarningMessage(
          `新发现 ${pendingCount} 个待处理项`,
          '立即处理队列'
        ).then(choice => {
          if (choice === '立即处理队列') {
            vscode.commands.executeCommand('vectahubTasks.processAllQueue');
          }
        });
      } else {
        vscode.window.showInformationMessage('✅ 同步完成，队列为空');
      }
    });
  });
  context.subscriptions.push(disposable);
}
