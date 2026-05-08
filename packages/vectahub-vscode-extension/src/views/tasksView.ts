import * as vscode from 'vscode';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem } from './treeItems.js';

export class TasksViewProvider implements vscode.TreeDataProvider<VectaHubTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<VectaHubTreeItem | undefined | null | void> = new vscode.EventEmitter<VectaHubTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<VectaHubTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: VectaHubTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: VectaHubTreeItem): Thenable<VectaHubTreeItem[]> {
    if (element instanceof CategoryTreeItem) {
      return Promise.resolve(element.children);
    }

    if (!element) {
      return Promise.resolve([
        new CategoryTreeItem('Common', [
          new TaskTreeItem('Git Status', { command: 'vectahubTasks.runCommonTask', title: 'Git Status', arguments: ['查看 git 状态'] }, 'git-compare'),
          new TaskTreeItem('Run Tests', { command: 'vectahubTasks.runCommonTask', title: 'Run Tests', arguments: ['运行测试'] }, 'test-view-icon'),
          new TaskTreeItem('Build Project', { command: 'vectahubTasks.runCommonTask', title: 'Build Project', arguments: ['构建项目'] }, 'build'),
          new TaskTreeItem('Doctor', { command: 'vectahubTasks.doctor', title: 'Run Doctor' }, 'pulse'),
        ]),
        new CategoryTreeItem('Natural Language', [
          new TaskTreeItem('Preview Intent', { command: 'vectahubTasks.previewIntent', title: 'Preview Intent' }, 'search'),
          new TaskTreeItem('Run Intent', { command: 'vectahubTasks.runIntent', title: 'Run Intent' }, 'play-circle'),
        ]),
        new CategoryTreeItem('Recent', []),
        new CategoryTreeItem('Failed', []),
      ]);
    }

    return Promise.resolve([]);
  }
}

export function registerTasksView(context: vscode.ExtensionContext) {
  const provider = new TasksViewProvider();
  const view = vscode.window.createTreeView('vectahubTasks.tasksView', {
    treeDataProvider: provider,
    showCollapseAll: true
  });
  context.subscriptions.push(view);
  return provider;
}
