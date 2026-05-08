import * as vscode from 'vscode';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem } from './treeItems.js';
import { detectProjectTasks } from '../project/detector.js';
import { ProjectTask } from '../project/taskModel.js';
import { getRecentTasks, getFailedTasks } from '../project/taskHistory.js';

export class TasksViewProvider implements vscode.TreeDataProvider<VectaHubTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<VectaHubTreeItem | undefined | null | void> = new vscode.EventEmitter<VectaHubTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<VectaHubTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private projectTasks: ProjectTask[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: VectaHubTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VectaHubTreeItem): Promise<VectaHubTreeItem[]> {
    if (element instanceof CategoryTreeItem) {
      return element.children;
    }

    if (!element) {
      this.projectTasks = await detectProjectTasks();

      const projectItems = this.projectTasks
        .filter(t => t.source === 'package-json')
        .map(t => new TaskTreeItem(t.label, {
          command: 'vectahubTasks.runProjectTask',
          title: t.label,
          arguments: [t]
        }, this.getIconForKind(t.kind), t.source, t.description));

      const gitItems = this.projectTasks
        .filter(t => t.source === 'git')
        .map(t => new TaskTreeItem(t.label, {
          command: 'vectahubTasks.runProjectTask',
          title: t.label,
          arguments: [t]
        }, 'git-compare', t.source));

      const vhItems = [
        new TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
        new TaskTreeItem('预览意图', { command: 'vectahubTasks.previewIntent', title: '预览自然语言意图' }, 'search'),
        new TaskTreeItem('执行意图', { command: 'vectahubTasks.runIntent', title: '执行自然语言任务' }, 'play-circle'),
      ];

      const recentTasks = getRecentTasks(20);
      const recentItems = recentTasks.map(t => new TaskTreeItem(
        t.label,
        {
          command: 'vectahubTasks.showOutput',
          title: t.label,
          arguments: [t]
        },
        t.status === 'success' ? 'check' : 'error',
        t.source,
        t.status === 'failed' && t.errorMessage ? t.errorMessage : t.command || t.intent
      ));

      const failedTasks = getFailedTasks(20);
      const failedItems = failedTasks.map(t => new TaskTreeItem(
        t.label,
        {
          command: 'vectahubTasks.showOutput',
          title: t.label,
          arguments: [t]
        },
        'error',
        t.source,
        t.errorMessage || t.command || t.intent
      ));

      return [
        new CategoryTreeItem('项目任务', projectItems),
        new CategoryTreeItem('Git 仓库', gitItems),
        new CategoryTreeItem('VectaHub 核心', vhItems),
        new CategoryTreeItem('最近任务', recentItems),
        new CategoryTreeItem('失败记录', failedItems),
      ];
    }

    return [];
  }

  private getIconForKind(kind: string): string {
    switch (kind) {
      case 'test': return 'beaker';
      case 'build': return 'package';
      case 'lint': return 'check-all';
      case 'typecheck': return 'symbol-class';
      case 'install': return 'cloud-download';
      default: return 'play';
    }
  }
}

export function registerTasksView(context: vscode.ExtensionContext) {
  const provider = new TasksViewProvider();
  const view = vscode.window.createTreeView('vectahubTasks.tasksView', {
    treeDataProvider: provider,
    showCollapseAll: true
  });
  context.subscriptions.push(view);

  const disposable = vscode.commands.registerCommand('vectahubTasks.showOutput', (task) => {
    if (task && task.errorMessage) {
      vscode.window.showErrorMessage(`${task.label}: ${task.errorMessage}`);
    } else {
      vscode.commands.executeCommand('vectahubTasks.view.output');
    }
  });
  context.subscriptions.push(disposable);

  return provider;
}
