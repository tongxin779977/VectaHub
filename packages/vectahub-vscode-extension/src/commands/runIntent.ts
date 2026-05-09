import * as vscode from 'vscode';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { getOutputChannel } from '../ui/output.js';

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
    await runner.run(plan);
  });
  context.subscriptions.push(disposable);
}
