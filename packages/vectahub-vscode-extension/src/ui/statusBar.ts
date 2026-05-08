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

  const statusTextMap = {
    'Ready': '就绪',
    'CLI Missing': 'CLI 缺失',
    'Running': '运行中...',
    'Failed': '失败'
  };

  statusBarItem.text = `$(tasklist) VectaHub: ${statusTextMap[status]}`;
  
  switch (status) {
    case 'CLI Missing':
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarItem.tooltip = 'VectaHub CLI 未找到。点击安装。';
      statusBarItem.command = 'vectahubTasks.installCli';
      break;
    case 'Failed':
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarItem.tooltip = '上个任务执行失败。点击查看输出。';
      statusBarItem.command = 'workbench.action.output.toggleOutput';
      break;
    default:
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = `VectaHub 已${statusTextMap[status]}`;
      statusBarItem.command = 'vectahubTasks.tasksView.focus';
  }
}
