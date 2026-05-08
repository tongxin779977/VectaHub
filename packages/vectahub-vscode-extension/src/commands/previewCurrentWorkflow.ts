import * as vscode from 'vscode';
import { createWorkflowFilePlan } from '../execution/planBuilder.js';
import { previewPlan } from '../execution/planRunner.js';

export async function previewWorkflowFile(uri: vscode.Uri) {
  const plan = createWorkflowFilePlan(uri.fsPath);
  const ok = await previewPlan(plan);
  return ok ? { workflow: { name: uri.fsPath } } : undefined;
}

export function registerPreviewCurrentWorkflowCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.previewCurrentWorkflow', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const doc = editor.document;
    if (doc.languageId !== 'yaml' && !doc.fileName.endsWith('.yaml') && !doc.fileName.endsWith('.yml')) {
      vscode.window.showWarningMessage('当前文件不是一个 YAML 工作流文件。');
      return;
    }
    
    await previewWorkflowFile(doc.uri);
  });
  context.subscriptions.push(disposable);
}
