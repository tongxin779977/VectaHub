import * as vscode from 'vscode';

export function registerRunCommonTaskCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runCommonTask', async (intent: string) => {
    // 默认执行策略: strict + preview first
    // 这里先调用 Preview，成功后再确认执行
    await vscode.commands.executeCommand('vectahubTasks.runIntent', intent);
  });
  context.subscriptions.push(disposable);
}
