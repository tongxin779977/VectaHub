import * as vscode from 'vscode';

export function getCliPath(): string {
  return vscode.workspace.getConfiguration('vectahubTasks').get<string>('cliPath') || 'vectahub';
}

export function getAutoDetectCli(): boolean {
  return vscode.workspace.getConfiguration('vectahubTasks').get<boolean>('autoDetectCli', true);
}

export function getExecutionMode(): 'strict' | 'relaxed' | 'consensus' {
  return vscode.workspace.getConfiguration('vectahubTasks').get<'strict' | 'relaxed' | 'consensus'>('executionMode', 'strict');
}

export function getPreviewBeforeRun(): boolean {
  return vscode.workspace.getConfiguration('vectahubTasks').get<boolean>('previewBeforeRun', true);
}

export function getLogTruncationLimit(): number {
  return vscode.workspace.getConfiguration('vectahubTasks').get<number>('logTruncationLimit', 2000);
}
