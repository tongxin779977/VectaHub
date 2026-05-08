import * as vscode from 'vscode';

export async function showCliMissingWarning() {
  const selection = await vscode.window.showErrorMessage(
    'VectaHub CLI is not found in your system.',
    'Install',
    'Open Settings'
  );

  if (selection === 'Install') {
    vscode.commands.executeCommand('vectahubTasks.installCli');
  } else if (selection === 'Open Settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'vectahubTasks.cliPath');
  }
}
