import * as vscode from 'vscode';
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

const SAFE_TASK_KINDS: ReadonlySet<string> = new Set([
  'test', 'lint', 'typecheck', 'build', 'dev', 'start', 'serve',
  'preview', 'watch', 'format', 'format:check', 'coverage',
  'check', 'validate', 'storybook', 'install', 'git-status', 'doctor'
]);

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
  const result = await runCli<DryRunResult>(args);

  if (!result.ok) {
    const reason = result.error?.message || result.stderr || 'dry-run 检测失败';
    return { safe: false, reason };
  }

  return { safe: true };
}

export function registerRunProjectTaskCommand(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runProjectTask', async (task: ProjectTask) => {
    logToOutput(`[DEBUG] runProjectTask 开始执行，task: ${task.label}`);
    const startedAt = new Date();

    const plan = PlanBuilder.createProjectTaskPlan(task);
    if (!plan) {
      vscode.window.showWarningMessage('该任务缺少可执行命令。');
      return;
    }

    const isSafeKind = SAFE_TASK_KINDS.has(task.kind);
    const commandStr = buildCommandString(task);

    if (!isSafeKind && commandStr) {
      const dangerousMatch = getDangerousMatch(commandStr);
      if (dangerousMatch) {
        logToOutput(`[runProjectTask] 危险命令检测命中: ${dangerousMatch}`);
        const confirmed = await confirmHighRisk(task, `命令包含危险模式: "${dangerousMatch}"`);
        if (!confirmed) {
          addTaskRecord({
            id: `task-${Date.now()}`,
            label: task.label,
            kind: task.kind,
            source: task.source,
            status: 'cancelled',
            command: commandStr,
            startedAt,
            endedAt: new Date()
          });
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
              addTaskRecord({
                id: `task-${Date.now()}`,
                label: task.label,
                kind: task.kind,
                source: task.source,
                status: 'cancelled',
                command: commandStr,
                startedAt,
                endedAt: new Date()
              });
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
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`预览失败: ${msg}`);
        return;
      }

      const confirm = await vscode.window.showInformationMessage(
        `预览通过，确认执行: "${task.label}"?`,
        { modal: true },
        '确认执行'
      );
      if (confirm !== '确认执行') return;
    }

    const runner = new PlanRunner(getOutputChannel());
    let status: 'success' | 'failed' | 'cancelled' = 'success';
    try {
      await runner.run(plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status = message.includes('cancelled') ? 'cancelled' : 'failed';
    } finally {
      const endedAt = new Date();
      addTaskRecord({
        id: `task-${Date.now()}`,
        label: task.label,
        kind: task.kind,
        source: task.source,
        status,
        command: task.command ? `${task.command.cli} ${task.command.args.join(' ')}` : undefined,
        startedAt,
        endedAt
      });
      tasksProvider.refresh();
    }
  });
  context.subscriptions.push(disposable);
}
