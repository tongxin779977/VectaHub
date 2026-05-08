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
      `确认要执行工作流 "${preview.workflow.name}" 吗?`,
      { modal: true },
      '确认执行'
    );

    if (confirm === '确认执行') {
      logToOutput(`正在执行工作流文件: ${doc.fileName}`);
      updateStatusBar('Running');
      
      const result = await runCli<any>(['run', '-f', doc.uri.fsPath, '--json', '--mode', 'strict']);
      
      if (result.ok) {
        logToOutput('工作流执行成功。');
        vscode.window.showInformationMessage(`工作流 "${preview.workflow.name}" 执行成功！`);
        updateStatusBar('Ready');
      } else {
        logToOutput(`工作流执行失败: ${result.error?.message || result.stderr}`, 'error');
        vscode.window.showErrorMessage('工作流执行失败。');
        updateStatusBar('Failed');
      }
    }
  });
  context.subscriptions.push(disposable);
}
