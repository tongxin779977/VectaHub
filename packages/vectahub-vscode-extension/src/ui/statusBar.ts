import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;

export function initStatusBar(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBarItem);
  updateStatusBar('Ready');
  statusBarItem.show();
}

export function updateStatusBar(status: 'Ready' | 'CLI Missing' | 'Running' | 'Failed') {
  if (!statusBarItem) return;

  statusBarItem.text = `$(tasklist) VectaHub: ${status}`;
  
  switch (status) {
    case 'CLI Missing':
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarItem.tooltip = 'VectaHub CLI is missing. Click to install.';
      statusBarItem.command = 'vectahubTasks.installCli';
      break;
    case 'Failed':
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarItem.tooltip = 'Last task failed. Click to see output.';
      statusBarItem.command = 'workbench.action.output.toggleOutput';
      break;
    default:
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = `VectaHub is ${status}`;
      statusBarItem.command = 'vectahubTasks.tasksView.focus';
  }
}
