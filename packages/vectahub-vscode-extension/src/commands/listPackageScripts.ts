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
      vscode.window.showInformationMessage('No scripts found in package.json.');
      return;
    }

    const items = scripts.map(s => ({
      label: s.label,
      description: s.description,
      task: s
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a package script to run',
      matchOnDescription: true
    });

    if (selected) {
      logToOutput(`Selected script: ${selected.label}`);
      // 复用 runProjectTask 逻辑，但由于 QuickPick 直接触发，我们手动调起 preview/run 流程
      vscode.commands.executeCommand('vectahubTasks.runProjectTask', selected.task);
    }
  });
  context.subscriptions.push(disposable);
}