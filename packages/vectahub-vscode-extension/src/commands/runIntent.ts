import * as vscode from 'vscode';
import { createIntentPlan } from '../execution/planBuilder.js';
import { runPlan } from '../execution/planRunner.js';

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

    await runPlan(createIntentPlan(input));
  });
  context.subscriptions.push(disposable);
}
