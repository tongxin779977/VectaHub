import * as vscode from 'vscode';
import { createWorkflowFilePlan } from '../execution/planBuilder.js';
import { runPlan } from '../execution/planRunner.js';

export function registerRunCurrentWorkflowCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runCurrentWorkflow', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const doc = editor.document;
    if (doc.languageId !== 'yaml' && !doc.fileName.endsWith('.yaml') && !doc.fileName.endsWith('.yml')) {
      return;
    }

    await runPlan(createWorkflowFilePlan(doc.uri.fsPath));
  });
  context.subscriptions.push(disposable);
}
