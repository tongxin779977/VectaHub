import * as vscode from 'vscode';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { getOutputChannel, logToOutput } from '../ui/output.js';
import { getPreviewBeforeRun } from '../config/settings.js';

export function registerRunIntentCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runIntent', async (intent?: string) => {
    const input = intent || await vscode.window.showInputBox({
      prompt: '输入自然语言意图',
      placeHolder: '查看 git 状态',
    });

    if (!input) {
      vscode.window.showWarningMessage('已取消输入');
      return;
    }

    const plan = PlanBuilder.buildIntentPlan(input);
    const runner = new PlanRunner(getOutputChannel());

    if (getPreviewBeforeRun()) {
      logToOutput(`[runIntent] previewBeforeRun=true, 先执行 dry-run: ${input}`);
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
        `预览通过，确认执行: "${input}"?`,
        { modal: true },
        '确认执行'
      );

      if (confirm !== '确认执行') return;
    }

    await runner.run(plan);
  });
  context.subscriptions.push(disposable);
}
