import * as vscode from 'vscode';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { getOutputChannel } from '../ui/output.js';

export interface PreviewResult {
  ok: boolean;
  intent: string;
  steps: Array<{ cli: string; args: string[] }>;
}

export async function previewIntent(intent?: string): Promise<PreviewResult | undefined> {
  const input = intent || await vscode.window.showInputBox({
    prompt: '输入自然语言意图 (例如: 查看 git 状态, 构建项目)',
    placeHolder: '查看 git 状态'
  });

  if (!input) {
    vscode.window.showWarningMessage('已取消输入');
    return undefined;
  }

  const plan = PlanBuilder.buildIntentPlan(input);
  const runner = new PlanRunner(getOutputChannel());
  const result = await runner.preview(plan);
  
  // 保持现有调用兼容
  return {
    ok: result?.ok ?? false,
    intent: input,
    steps: []
  };
}

export function registerPreviewIntentCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.previewIntent', async (intent?: string) => {
    await previewIntent(intent);
  });
  context.subscriptions.push(disposable);
}
