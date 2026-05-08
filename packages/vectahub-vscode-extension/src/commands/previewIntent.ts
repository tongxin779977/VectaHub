import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';

export interface PreviewResult {
  ok: boolean;
  intent: string;
  steps: Array<{ cli: string; args: string[] }>;
}

export async function previewIntent(intent?: string): Promise<PreviewResult | undefined> {
  const input = intent || await vscode.window.showInputBox({
    prompt: '输入自然语言意图 (例如: 查看 git 状态)',
    placeHolder: '查看 git 状态'
  });

  if (!input) return undefined;

  logToOutput(`Previewing Intent: "${input}"`);
  
  const result = await runCli<any>(['run', '--dry-run', '--json', input]);
  
  if (result.ok && result.data) {
    logToOutput('Preview Success:');
    logToOutput(`- Matched Intent: ${result.data.intent}`);
    result.data.steps.forEach((s: any, i: number) => {
      logToOutput(`  [Step ${i+1}] ${s.cli} ${s.args.join(' ')}`);
    });
    
    return {
      ok: true,
      intent: result.data.intent,
      steps: result.data.steps
    };
  } else {
    const errorMsg = result.error?.message || result.stderr || '未知错误';
    logToOutput(`Preview Failed: ${errorMsg}`, 'error');
    vscode.window.showErrorMessage(`意图预览失败: ${errorMsg}`);
    return { ok: false, intent: input, steps: [] };
  }
}

export function registerPreviewIntentCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.previewIntent', async (intent?: string) => {
    await previewIntent(intent);
  });
  context.subscriptions.push(disposable);
}
