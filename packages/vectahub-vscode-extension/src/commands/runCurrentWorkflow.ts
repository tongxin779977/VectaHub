import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';
import { previewWorkflowFile } from './previewCurrentWorkflow.js';

export function registerRunCurrentWorkflowCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.runCurrentWorkflow', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const doc = editor.document;
    if (doc.languageId !== 'yaml' && !doc.fileName.endsWith('.yaml') && !doc.fileName.endsWith('.yml')) {
      return;
    }

    // 1. 预览
    const preview = await previewWorkflowFile(doc.uri);
    if (!preview) return;

    // 2. 确认
    const confirm = await vscode.window.showWarningMessage(
      `确认执行工作流 "${preview.workflow.name}"?`,
      { modal: true },
      '确认执行'
    );

    if (confirm === '确认执行') {
      logToOutput(`Running Workflow File: ${doc.fileName}`);
      updateStatusBar('Running');
      
      const result = await runCli<any>(['run', '-f', doc.uri.fsPath, '--json', '--mode', 'strict']);
      
      if (result.ok) {
        logToOutput('Workflow Execution Success.');
        vscode.window.showInformationMessage(`工作流 "${preview.workflow.name}" 执行成功！`);
        updateStatusBar('Ready');
      } else {
        logToOutput(`Workflow Execution Failed: ${result.error?.message || result.stderr}`, 'error');
        vscode.window.showErrorMessage('工作流执行失败。');
        updateStatusBar('Failed');
      }
    }
  });
  context.subscriptions.push(disposable);
}
