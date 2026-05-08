import * as vscode from 'vscode';

export function getCliPath(): string {
  return vscode.workspace.getConfiguration('vectahubTasks').get<string>('cliPath') || 'vectahub';
}

export function getAutoDetectCli(): boolean {
  return vscode.workspace.getConfiguration('vectahubTasks').get<boolean>('autoDetectCli', true);
}
