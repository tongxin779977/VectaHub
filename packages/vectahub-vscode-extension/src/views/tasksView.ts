import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem } from './treeItems.js';
import { detectProjectTasks } from '../project/detector.js';
import { ProjectTask } from '../project/taskModel.js';
import { getVectaHubHome, runCli } from '../cli/adapter.js';

export class TasksViewProvider implements vscode.TreeDataProvider<VectaHubTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<VectaHubTreeItem | undefined | null | void> = new vscode.EventEmitter<VectaHubTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<VectaHubTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private projectTasks: ProjectTask[] = [];
  private diagnosticTasks: any[] = [];
  private watcher?: vscode.FileSystemWatcher;

  constructor() {
    this.setupWatcher();
  }

  private setupWatcher() {
    const home = getVectaHubHome();
    const pattern = new vscode.RelativePattern(home, 'diagnostic-queue.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: VectaHubTreeItem): vscode.TreeItem {
    return element;
  }

  private async getDiagnosticTasks(): Promise<any[]> {
    const queueFile = path.join(getVectaHubHome(), 'diagnostic-queue.json');
    if (!fs.existsSync(queueFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(queueFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async getChildren(element?: VectaHubTreeItem): Promise<VectaHubTreeItem[]> {
    if (element instanceof CategoryTreeItem) {
      return element.children;
    }

    if (!element) {
      this.projectTasks = await detectProjectTasks();
      this.diagnosticTasks = await this.getDiagnosticTasks();
      
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

      const diagnosticItems = this.diagnosticTasks
        .map(t => {
          const icon = t.status === 'completed' ? 'check' : t.status === 'processing' ? 'sync~spin' : t.status === 'failed' ? 'error' : 'warning';
          return new TaskTreeItem(t.title, {
            command: 'vectahubTasks.runIntent',
            title: t.title,
            arguments: [t.commandToFix]
          }, icon, t.status, t.description);
        });

      const vhItems = [
        new TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
        new TaskTreeItem('获取 GitHub Actions 错误', { command: 'vectahubTasks.fetchGhErrors', title: '拉取最新失败记录' }, 'cloud-download'),
        new TaskTreeItem('一键处理诊断队列', { command: 'vectahubTasks.processAllQueue', title: '开始批量修复' }, 'play-all'),
      ];

      return [
        new CategoryTreeItem('诊断与维护队列', diagnosticItems),
        new CategoryTreeItem('项目任务', projectItems),
        new CategoryTreeItem('Git 仓库', gitItems),
        new CategoryTreeItem('VectaHub 核心', vhItems),
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
  return provider;
}
