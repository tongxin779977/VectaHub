import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ProjectTask } from '../project/taskModel.js';
import { logToOutput, getOutputChannel } from '../ui/output.js';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { addTaskRecord } from '../project/taskHistory.js';
import { TasksViewProvider } from '../views/tasksView.js';
import { getPreviewBeforeRun } from '../config/settings.js';
import { getDangerousMatch } from '../cli/dangerDetection.js';
import { runCli } from '../cli/adapter.js';
import { waitForCliReady } from '../cli/readiness.js';

function generateTaskRecordId(): string {
  return `task-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

const SAFE_TASK_KINDS: ReadonlySet<string> = new Set([
  'test', 'lint', 'typecheck', 'build', 'dev', 'start', 'serve',
  'preview', 'watch', 'format', 'coverage',
  'check', 'validate', 'storybook', 'install', 'git-status', 'doctor'
]);

const runningTaskIds = new Set<string>();

export function isProjectTaskRunning(taskId: string): boolean {
  return runningTaskIds.has(taskId);
}

export function markTaskRunning(taskId: string, provider?: TasksViewProvider): void {
  runningTaskIds.add(taskId);
  provider?.refresh();
}

export function markTaskFinished(taskId: string, provider?: TasksViewProvider): void {
  runningTaskIds.delete(taskId);
  provider?.refresh();
}

interface DryRunResult {
  ok: boolean;
  error?: { code?: string; message?: string };
}

function buildCommandString(task: ProjectTask): string {
  if (!task.command) return '';
  return `${task.command.cli} ${task.command.args.join(' ')}`.trim();
}

async function confirmHighRisk(task: ProjectTask, reason: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `⚠️ 高风险任务: ${task.label}\n${reason}`,
    { modal: true },
    '确认执行',
    '取消'
  );
  return choice === '确认执行';
}

async function performDryRunCheck(task: ProjectTask): Promise<{ safe: boolean; reason?: string }> {
  if (!task.command) return { safe: true };

  const args = ['run-command', '--dry-run', '--json', '--', task.command.cli, ...task.command.args];
  const result = await runCli<DryRunResult>(args, { timeout: 30000 });

  if (!result.ok) {
    const reason = result.error?.message || result.stderr || 'dry-run 检测失败';
    return { safe: false, reason };
  }

  return { safe: true };
}

export function registerRunProjectTaskCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runProjectTask', async (task: ProjectTask) => {
    if (runningTaskIds.has(task.id)) {
      vscode.window.showWarningMessage(`任务 "${task.label}" 正在执行中...`);
      return;
    }
    
    markTaskRunning(task.id, tasksProvider);
    logToOutput(`[DEBUG] runProjectTask 开始执行，task: ${task.label}`);
    
    const startedAt = new Date();
    let status: 'success' | 'failed' | 'cancelled' = 'success';
    let commandStr = '';

    try {
      const plan = PlanBuilder.createProjectTaskPlan(task);
      if (!plan) {
        vscode.window.showWarningMessage('该任务缺少可执行命令。');
        status = 'failed';
        return;
      }

      const isSafeKind = SAFE_TASK_KINDS.has(task.kind);
      commandStr = buildCommandString(task);

      if (!isSafeKind && commandStr) {
        const dangerousMatch = getDangerousMatch(commandStr);
        if (dangerousMatch) {
          logToOutput(`[runProjectTask] 危险命令检测命中: ${dangerousMatch}`);
          const confirmed = await confirmHighRisk(task, `命令包含危险模式: "${dangerousMatch}"`);
          if (!confirmed) {
            status = 'cancelled';
            return;
          }
        } else {
          const ready = await waitForCliReady();
          if (ready) {
            const dryRun = await performDryRunCheck(task);
            if (!dryRun.safe) {
              logToOutput(`[runProjectTask] dry-run 检测不安全: ${dryRun.reason}`);
              const confirmed = await confirmHighRisk(task, `dry-run 检测: ${dryRun.reason}`);
              if (!confirmed) {
                status = 'cancelled';
                return;
              }
            }
          }
        }
      }

      if (getPreviewBeforeRun() && !isSafeKind) {
        logToOutput(`[runProjectTask] previewBeforeRun=true, 非安全任务先预览: ${task.label}`);
        const runner = new PlanRunner(getOutputChannel());
        try {
          const previewResult = await runner.preview(plan);
          if (!previewResult || previewResult.ok === false) {
            const errMsg = previewResult?.error?.message || '预览失败';
            vscode.window.showErrorMessage(`预览失败: ${errMsg}`);
            status = 'failed';
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`预览失败: ${msg}`);
          status = 'failed';
          return;
        }

        const confirm = await vscode.window.showInformationMessage(
          `预览通过，确认执行: "${task.label}"?`,
          { modal: true },
          '确认执行'
        );
        if (confirm !== '确认执行') {
          status = 'cancelled';
          return;
        }
      }

      const runner = new PlanRunner(getOutputChannel());
      try {
        await runner.run(plan);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        status = message.includes('cancelled') ? 'cancelled' : 'failed';
      }
    } catch (err) {
      logToOutput(`[runProjectTask] 未捕获异常: ${err}`, 'error');
      status = 'failed';
    } finally {
      markTaskFinished(task.id, tasksProvider);
      const endedAt = new Date();
      addTaskRecord({
        id: generateTaskRecordId(),
        label: task.label,
        kind: task.kind,
        source: task.source,
        status,
        command: commandStr || (task.command ? `${task.command.cli} ${task.command.args.join(' ')}` : undefined),
        startedAt,
        endedAt
      });
    }
  });
  context.subscriptions.push(disposable);
}
