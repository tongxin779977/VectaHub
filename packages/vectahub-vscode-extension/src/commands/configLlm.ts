import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';

interface SetupResult {
  ok: boolean;
  message?: string;
}

export function registerConfigLlmCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.configLlm', async () => {
    logToOutput('正在启动 LLM 配置流程...');
    updateStatusBar('Running');

    const result = await runCli<SetupResult>(['setup', '--json']);

    if (result.ok && result.data) {
      logToOutput('LLM 配置完成');
      vscode.window.showInformationMessage('LLM 配置完成！');
      updateStatusBar('Ready');
    } else {
      const errorMsg = result.error?.message || result.stderr || '未知错误';
      logToOutput(`LLM 配置失败: ${errorMsg}`, 'error');
      vscode.window.showErrorMessage(`LLM 配置失败: ${errorMsg}`);
      updateStatusBar('Failed');
    }
  });
  context.subscriptions.push(disposable);
}
