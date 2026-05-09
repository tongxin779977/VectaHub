import * as vscode from 'vscode';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { getOutputChannel } from '../ui/output.js';

export function registerRunCurrentWorkflowCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runCurrentWorkflow', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const doc = editor.document;
    if (doc.languageId !== 'yaml' && !doc.fileName.endsWith('.yaml') && !doc.fileName.endsWith('.yml')) {
      return;
    }

    const plan = PlanBuilder.buildWorkflowFilePlan(doc.uri.fsPath);
    const runner = new PlanRunner(getOutputChannel());
    await runner.run(plan);
  });
  context.subscriptions.push(disposable);
}
