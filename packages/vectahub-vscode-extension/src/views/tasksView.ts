import * as vscode from 'vscode';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem } from './treeItems.js';
import { detectProjectTasks } from '../project/detector.js';
import { ProjectTask } from '../project/taskModel.js';

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
        new TaskTreeItem('Doctor', { command: 'vectahubTasks.doctor', title: 'Run Doctor' }, 'pulse'),
        new TaskTreeItem('Preview Intent', { command: 'vectahubTasks.previewIntent', title: 'Preview Intent' }, 'search'),
        new TaskTreeItem('Run Intent', { command: 'vectahubTasks.runIntent', title: 'Run Intent' }, 'play-circle'),
      ];

      return [
        new CategoryTreeItem('Project', projectItems),
        new CategoryTreeItem('Git', gitItems),
        new CategoryTreeItem('VectaHub', vhItems),
        new CategoryTreeItem('Recent', []),
        new CategoryTreeItem('Failed', []),
      ];
    }

    return [];
  }

  private getIconForKind(kind: string): string {
    switch (kind) {
      case 'test': return 'test-view-icon';
      case 'build': return 'build';
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
  return provider;
}
