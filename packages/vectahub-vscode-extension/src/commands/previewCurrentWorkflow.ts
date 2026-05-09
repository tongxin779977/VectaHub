import * as vscode from 'vscode';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { getOutputChannel } from '../ui/output.js';

export async function previewWorkflowFile(uri: vscode.Uri) {
  const plan = PlanBuilder.buildWorkflowFilePlan(uri.fsPath);
  const runner = new PlanRunner(getOutputChannel());
  const result = await runner.preview(plan);
  return result;
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
