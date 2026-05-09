import * as vscode from 'vscode';

export type ExecutionMode = 'strict' | 'relaxed' | 'consensus';

export type ExecutionPlan =
  | IntentExecutionPlan
  | CommandExecutionPlan
  | WorkflowFileExecutionPlan;

export interface BaseExecutionPlan {
  id: string;
  label: string;
  source: 'intent' | 'package-json' | 'git' | 'workflow-file' | 'manual';
  mode: ExecutionMode;
  cwd?: string;
}

export interface IntentExecutionPlan extends BaseExecutionPlan {
  type: 'intent';
  intent: string;
}

export interface CommandExecutionPlan extends BaseExecutionPlan {
  type: 'command';
  command: {
    cli: string;
    args: string[];
  };
}

export interface WorkflowFileExecutionPlan extends BaseExecutionPlan {
  type: 'workflowFile';
  file: string;
}

export function getWorkspaceCwd(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    return vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
