import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { getPreviewBeforeRun } from '../config/settings.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';
import { ExecutionPlan } from './plan.js';
import { renderPlanCommand, renderPlanPreview } from './planRenderer.js';

export async function previewPlan(plan: ExecutionPlan): Promise<boolean> {
  if (plan.type === 'intent') {
    const result = await runCli(['run', '--dry-run', '--json', plan.intent], { cwd: plan.cwd });
    if (!result.ok) {
      showPlanError('预览失败', result.error?.message || result.stderr);
      return false;
    }
    logToOutput(renderPlanPreview(plan));
    return true;
  }

  if (plan.type === 'workflowFile') {
    const result = await runCli(['run', '-f', plan.file, '--dry-run', '--json'], { cwd: plan.cwd });
    if (!result.ok) {
      showPlanError('工作流预览失败', result.error?.message || result.stderr);
      return false;
    }
    logToOutput(renderPlanPreview(plan));
    return true;
  }

  logToOutput(renderPlanPreview(plan));
  return true;
}

export async function runPlan(plan: ExecutionPlan): Promise<boolean> {
  if (getPreviewBeforeRun()) {
    const ok = await previewPlan(plan);
    if (!ok) return false;
  }

  const confirm = await vscode.window.showWarningMessage(
    `确认执行?\n\n${renderPlanPreview(plan)}`,
    { modal: true },
    '确认执行',
    '在终端中手动执行'
  );

  if (confirm === '在终端中手动执行') {
    const terminal = vscode.window.createTerminal(`VectaHub: ${plan.label}`);
    terminal.show();
    terminal.sendText(renderPlanCommand(plan), false);
    return false;
  }

  if (confirm !== '确认执行') return false;

  if (plan.type === 'command') {
    vscode.window.showWarningMessage('当前 CLI 尚未支持明确命令执行接口，已改为在终端中展示真实命令。');
    const terminal = vscode.window.createTerminal(`VectaHub: ${plan.label}`);
    terminal.show();
    terminal.sendText(renderPlanCommand(plan), false);
    return false;
  }

  updateStatusBar('Running');
  const args = plan.type === 'intent'
    ? ['run', '--json', '--mode', plan.mode, plan.intent]
    : ['run', '-f', plan.file, '--json', '--mode', plan.mode];

  const result = await runCli(args, { cwd: plan.cwd });

  if (result.ok) {
    updateStatusBar('Ready');
    vscode.window.showInformationMessage('任务执行成功。');
    return true;
  }

  updateStatusBar('Failed');
  showPlanError('任务执行失败', result.error?.message || result.stderr);
  return false;
}

function showPlanError(title: string, detail?: string): void {
  const message = detail || '未知错误';
  logToOutput(`${title}: ${message}`, 'error');
  vscode.window.showErrorMessage(`${title}: ${message}`);
}
