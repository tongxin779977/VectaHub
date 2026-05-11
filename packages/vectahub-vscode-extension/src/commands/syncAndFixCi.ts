import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { waitForCliReady } from '../cli/readiness.js';
import { TasksViewProvider } from '../views/tasksView.js';
import { addTaskRecord } from '../project/taskHistory.js';
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

export function registerSyncAndFixCiCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.syncAndFixCi', async () => {
    const ready = await waitForCliReady();
    if (!ready) return;

    logToOutput('[syncAndFixCi] 开始同步并修复');
    const startedAt = new Date();

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'VectaHub: 同步并修复...',
      cancellable: true
    }, async (_progress, token) => {
      const fetchResult = await runCli<WorkflowResult>(
        ['run', '-f', 'sys:fetch-gh-actions-errors', '--json'],
        { token }
      );

      if (!fetchResult.ok) {
        if (fetchResult.error?.code === 'CANCELLED') {
          logToOutput('[syncAndFixCi] 拉取已由用户取消');
          vscode.window.showInformationMessage('⏸ 同步已取消');
        } else {
          const errMsg = fetchResult.error?.message || fetchResult.stderr || '未知错误';
          logToOutput(`[syncAndFixCi] 拉取失败: ${errMsg}`, 'error');
          vscode.window.showErrorMessage(`❌ 同步失败: ${errMsg}`);
        }
        return;
      }

      const queue = tasksProvider.readDiagnosticQueue();
      const workflowData = fetchResult.data as WorkflowResult | undefined;
      const pendingCount = extractPendingCount(workflowData, queue);

      tasksProvider.refresh();

      if (pendingCount === 0) {
        logToOutput('[syncAndFixCi] 拉取完成，无待处理项');
        vscode.window.showInformationMessage('✅ 同步完成，无待处理项');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `发现 ${pendingCount} 个待处理项，是否自动修复？`,
        { modal: true },
        '开始修复'
      );

      if (confirm !== '开始修复') {
        logToOutput('[syncAndFixCi] 用户取消修复');
        vscode.window.showInformationMessage('已取消');
        return;
      }

      logToOutput(`[syncAndFixCi] 开始批量修复: ${pendingCount} 个待处理任务`);

      const processResult = await runCli<WorkflowResult>(
        ['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed', '--json'],
        { token }
      );

      tasksProvider.refresh();

      const endedAt = new Date();

      if (!processResult.ok) {
        if (processResult.error?.code === 'CANCELLED') {
          logToOutput('[syncAndFixCi] 批量修复已由用户中止');
          addTaskRecord({
            id: `sync-fix-${Date.now()}`,
            label: '同步并修复',
            kind: 'sync-fix',
            source: 'vectahub',
            status: 'cancelled',
            command: `sync ${pendingCount} pending tasks`,
            startedAt,
            endedAt
          });
          vscode.window.showInformationMessage('⏸ 批量修复已由用户中止');
        } else {
          const errMsg = processResult.error?.message || '未知错误';
          logToOutput(`[syncAndFixCi] 批量修复中断: ${errMsg}`, 'error');
          addTaskRecord({
            id: `sync-fix-${Date.now()}`,
            label: '同步并修复',
            kind: 'sync-fix',
            source: 'vectahub',
            status: 'failed',
            command: `sync ${pendingCount} pending tasks`,
            startedAt,
            endedAt,
            errorMessage: errMsg
          });
          vscode.window.showErrorMessage(`❌ 批量修复中断: ${errMsg}`);
        }
        return;
      }

      const processData = processResult.data as WorkflowResult | undefined;
      const completedNow = processData?.summary?.processedCount ?? 0;
      const failedCount = processData?.summary?.failedCount ?? 0;
      const pendingAfter = processData?.summary?.remainingCount ?? 0;
      const needsConfirmCount = processData?.summary?.needsConfirmationCount ?? 0;

      const historyStatus = failedCount > 0 ? 'failed' : 'success';
      addTaskRecord({
        id: `sync-fix-${Date.now()}`,
        label: '同步并修复',
        kind: 'sync-fix',
        source: 'vectahub',
        status: historyStatus,
        command: `同步 ${pendingCount} 个: 完成 ${completedNow}, 失败 ${failedCount}, 剩余 ${pendingAfter}`,
        startedAt,
        endedAt,
        errorMessage: failedCount > 0 ? `${failedCount} 个任务处理失败` : undefined
      });

      logToOutput(`[syncAndFixCi] 批量修复完成: 已处理 ${completedNow}, 失败 ${failedCount}, 剩余 ${pendingAfter}`);

      const parts: string[] = [];
      if (completedNow > 0) parts.push(`✅ 已处理 ${completedNow}`);
      if (pendingAfter > 0) parts.push(`⏳ 剩余待处理 ${pendingAfter}`);
      if (failedCount > 0) parts.push(`❌ 失败 ${failedCount}`);
      if (needsConfirmCount > 0) parts.push(`⚠️ 待确认 ${needsConfirmCount}`);

      const msg = parts.length > 0
        ? `同步并修复完成: ${parts.join(' / ')}`
        : '✅ 同步并修复完成';

      if (failedCount > 0 || pendingAfter > 0 || needsConfirmCount > 0) {
        vscode.window.showWarningMessage(msg);
      } else {
        vscode.window.showInformationMessage(msg);
      }
    });
  });
  context.subscriptions.push(disposable);
}
