import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';

export async function previewWorkflowFile(uri: vscode.Uri) {
  logToOutput(`Previewing Workflow File: ${uri.fsPath}`);
  
  const result = await runCli<any>(['run', '-f', uri.fsPath, '--dry-run', '--json']);
  
  if (result.ok && result.data) {
    logToOutput(`Workflow Preview: ${result.data.workflow.name}`);
    result.data.workflow.steps.forEach((s: any, i: number) => {
      logToOutput(`  [Step ${i+1}] ${s.cli} ${s.args.join(' ')}`);
    });
    return result.data;
  } else {
    const errorMsg = result.error?.message || result.stderr || '未知错误';
    logToOutput(`Workflow Preview Failed: ${errorMsg}`, 'error');
    vscode.window.showErrorMessage(`工作流预览失败: ${errorMsg}`);
    return undefined;
  }
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
