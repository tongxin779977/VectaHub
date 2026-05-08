import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';

export function registerOpenWorkflowCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.openWorkflow', async () => {
    // 尝试在当前工作区找 .vectahub/workflows
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    
    const workflowsDir = path.join(workspaceFolder.uri.fsPath, '.vectahub', 'workflows');
    if (!fs.existsSync(workflowsDir)) {
      vscode.window.showInformationMessage('未在本工作区找到 .vectahub/workflows 目录。');
      return;
    }
    
    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (files.length === 0) {
      vscode.window.showInformationMessage('工作流目录为空。');
      return;
    }
    
    const selected = await vscode.window.showQuickPick(files, { placeHolder: '选择要打开的工作流文件' });
    if (selected) {
      const doc = await vscode.workspace.openTextDocument(path.join(workflowsDir, selected));
      await vscode.window.showTextDocument(doc);
    }
  });
  context.subscriptions.push(disposable);
}
