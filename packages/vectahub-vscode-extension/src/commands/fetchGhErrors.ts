import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';

export function registerFetchGhErrorsCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.fetchGhErrors', async () => {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "正在同步 GitHub Actions 失败记录...",
      cancellable: false
    }, async (progress) => {
      const result = await runCli(['run', '-f', 'sys:fetch-gh-actions-errors', '--mode', 'relaxed']);
      if (result.ok) {
        vscode.window.showInformationMessage('✅ GitHub 错误记录同步完成');
      } else {
        vscode.window.showErrorMessage(`❌ 同步失败: ${result.error?.message || '未知错误'}`);
      }
    });
  });
  context.subscriptions.push(disposable);
}
