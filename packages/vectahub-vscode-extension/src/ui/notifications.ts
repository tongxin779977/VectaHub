import * as vscode from 'vscode';

export async function showCliMissingWarning() {
  const selection = await vscode.window.showErrorMessage(
    'VectaHub CLI 未在系统中找到。',
    '立即安装',
    '打开设置'
  );

  if (selection === '立即安装') {
    vscode.commands.executeCommand('vectahubTasks.installCli');
  } else if (selection === '打开设置') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'vectahubTasks.cliPath');
  }
}
