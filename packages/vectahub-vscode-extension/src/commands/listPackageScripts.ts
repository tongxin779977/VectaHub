import * as vscode from 'vscode';
import { getAllPackageScripts } from '../project/packageScripts.js';
import { detectPackageManager } from '../project/packageManager.js';
import { logToOutput } from '../ui/output.js';

export function registerListPackageScriptsCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.listPackageScripts', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;

    const pm = detectPackageManager(workspaceFolder);
    const scripts = getAllPackageScripts(workspaceFolder, pm);

    if (scripts.length === 0) {
      vscode.window.showInformationMessage('在 package.json 中未找到任何脚本。');
      return;
    }

    const items = scripts.map(s => ({
      label: s.label,
      description: s.description,
      task: s
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要运行的项目脚本',
      matchOnDescription: true
    });

    if (selected) {
      logToOutput(`Selected script: ${selected.label}`);
      vscode.commands.executeCommand('vectahubTasks.runProjectTask', selected.task);
    }
  });
  context.subscriptions.push(disposable);
}
