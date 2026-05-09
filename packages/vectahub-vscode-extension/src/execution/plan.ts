import * as vscode from 'vscode';

export type ExecutionMode = 'strict' | 'relaxed' | 'consensus';

export type ExecutionPlan =
  | IntentExecutionPlan
  | CommandExecutionPlan
  | WorkflowFileExecutionPlan
  | CapabilityExecutionPlan;

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

/**
 * CLI 标准能力执行计划 (Capability Plan)
 * 对应 src/nl/capabilities/types.ts 中的 ExecutionPlan
 */
export interface CapabilityExecutionPlan extends BaseExecutionPlan {
  type: 'capability';
  capabilityId: string;
  steps: Array<{
    id: string;
    label: string;
    type: 'workflow' | 'command' | 'internal';
    command?: { cli: string; args: string[] };
    workflowFile?: string;
  }>;
  userReport: {
    summaryTemplate: string;
    nextActions?: string[];
    verificationSteps?: string[];
  };
}

export function getWorkspaceCwd(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    return vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
