import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem, EmptyStateTreeItem } from './treeItems.js';
import { detectProjectTasks } from '../project/detector.js';
import { ProjectTask } from '../project/taskModel.js';
import { getVectaHubHome } from '../cli/adapter.js';
import { DiagnosticTask, DiagnosticTaskStatus } from '../project/diagnosticModel.js';

const DEV_KINDS = ['dev', 'start', 'serve'];
const QUALITY_KINDS = ['test', 'build', 'lint', 'typecheck', 'check', 'validate', 'format', 'format:check', 'coverage', 'storybook'];

export class TasksViewProvider implements vscode.TreeDataProvider<VectaHubTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<VectaHubTreeItem | undefined | null | void> = new vscode.EventEmitter<VectaHubTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<VectaHubTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private projectTasks: ProjectTask[] = [];
  private diagnosticTasks: DiagnosticTask[] = [];
  private queueError: string | undefined;
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

  private readDiagnosticQueue(): { tasks: DiagnosticTask[]; error?: string } {
    const queueFile = path.join(getVectaHubHome(), 'diagnostic-queue.json');
    if (!fs.existsSync(queueFile)) {
      return { tasks: [] };
    }
    try {
      const content = fs.readFileSync(queueFile, 'utf-8');
      const data = JSON.parse(content);
      if (!Array.isArray(data)) {
        return { tasks: [], error: '队列数据格式不正确' };
      }
      return {
        tasks: data.filter((t: DiagnosticTask) => t && t.id && t.title && t.status)
      };
    } catch {
      return { tasks: [], error: '队列数据不可读' };
    }
  }

  async getChildren(element?: VectaHubTreeItem): Promise<VectaHubTreeItem[]> {
    if (element instanceof CategoryTreeItem) {
      return element.children;
    }

    if (!element) {
      this.projectTasks = await detectProjectTasks();
      const queueResult = this.readDiagnosticQueue();
      this.diagnosticTasks = queueResult.tasks;
      this.queueError = queueResult.error;

      const categories: CategoryTreeItem[] = [];

      this.addDevSection(categories);
      this.addQualitySection(categories);
      this.addCISection(categories);
      this.addQueueSection(categories);
      this.addGitSection(categories);
      this.addCoreSection(categories);
      this.addOtherScriptsSection(categories);

      return categories;
    }

    return [];
  }

  private addDevSection(categories: CategoryTreeItem[]): void {
    const devItems = this.projectTasks
      .filter(t => DEV_KINDS.includes(t.kind))
      .map(t => this.createTaskItem(t));

    if (devItems.length > 0) {
      categories.push(new CategoryTreeItem('一键开发', devItems));
    }
  }

  private addQualitySection(categories: CategoryTreeItem[]): void {
    const qualityItems = this.projectTasks
      .filter(t => QUALITY_KINDS.includes(t.kind))
      .map(t => this.createTaskItem(t));

    if (qualityItems.length > 0) {
      categories.push(new CategoryTreeItem('质量检查', qualityItems));
    }
  }

  private addCISection(categories: CategoryTreeItem[]): void {
    const gitAvailable = this.projectTasks.some(t => t.source === 'git');
    if (!gitAvailable) return;

    const ciItems: VectaHubTreeItem[] = [
      new TaskTreeItem('拉取 GitHub Actions 错误', {
        command: 'vectahubTasks.fetchGhErrors',
        title: '拉取最新失败记录'
      }, 'cloud-download'),
      new TaskTreeItem('自动处理诊断队列', {
        command: 'vectahubTasks.processAllQueue',
        title: '开始批量修复'
      }, 'play-all')
    ];

    categories.push(new CategoryTreeItem('CI 修复', ciItems));
  }

  private addQueueSection(categories: CategoryTreeItem[]): void {
    if (this.queueError) {
      categories.push(new CategoryTreeItem('自动化队列', [
        new EmptyStateTreeItem(this.queueError, 'warning')
      ]));
      return;
    }

    if (this.diagnosticTasks.length === 0) {
      categories.push(new CategoryTreeItem('自动化队列', [
        new EmptyStateTreeItem('队列为空，当前无待处理诊断', 'check')
      ]));
      return;
    }

    const statusGroups = this.groupDiagnosticsByStatus();
    const statusOrder: DiagnosticTaskStatus[] = ['pending', 'processing', 'failed', 'needs-confirmation', 'completed', 'cancelled'];
    const statusLabels: Record<string, string> = {
      'pending': '待处理',
      'processing': '处理中',
      'completed': '已完成',
      'failed': '失败',
      'cancelled': '已取消',
      'needs-confirmation': '待确认'
    };

    const queueChildren: VectaHubTreeItem[] = [];
    for (const status of statusOrder) {
      const tasks = statusGroups.get(status);
      if (!tasks || tasks.length === 0) continue;

      const statusItems = tasks.map(t => {
        const icon = this.getIconForStatus(t.status);
        return new TaskTreeItem(t.title, {
          command: 'vectahubTasks.runIntent',
          title: t.title,
          arguments: [t.commandToFix]
        }, icon, t.status, t.description);
      });

      queueChildren.push(new CategoryTreeItem(`${statusLabels[status] || status} (${tasks.length})`, statusItems));
    }

    if (queueChildren.length > 0) {
      categories.push(new CategoryTreeItem('自动化队列', queueChildren));
    }
  }

  private addGitSection(categories: CategoryTreeItem[]): void {
    const gitItems = this.projectTasks
      .filter(t => t.source === 'git')
      .map(t => new TaskTreeItem(t.label, {
        command: 'vectahubTasks.runProjectTask',
        title: t.label,
        arguments: [t]
      }, 'git-compare', t.source));

    if (gitItems.length > 0) {
      categories.push(new CategoryTreeItem('Git 仓库', gitItems));
    }
  }

  private addCoreSection(categories: CategoryTreeItem[]): void {
    const vhItems = [
      new TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
      new TaskTreeItem('执行自定义意图', { command: 'vectahubTasks.runIntent', title: '输入自然语言意图' }, 'comment')
    ];
    categories.push(new CategoryTreeItem('VectaHub 核心', vhItems));
  }

  private addOtherScriptsSection(categories: CategoryTreeItem[]): void {
    const otherPkgItems = this.projectTasks
      .filter(t => t.source === 'package-json' && !DEV_KINDS.includes(t.kind) && !QUALITY_KINDS.includes(t.kind) && t.kind !== 'install')
      .map(t => this.createTaskItem(t));

    if (otherPkgItems.length > 0) {
      categories.push(new CategoryTreeItem('其他项目脚本', otherPkgItems));
    }
  }

  groupDiagnosticsByStatus(): Map<DiagnosticTaskStatus, DiagnosticTask[]> {
    const groups = new Map<DiagnosticTaskStatus, DiagnosticTask[]>();
    for (const task of this.diagnosticTasks) {
      const validStatuses: DiagnosticTaskStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'needs-confirmation'];
      const status: DiagnosticTaskStatus = validStatuses.includes(task.status as DiagnosticTaskStatus)
        ? (task.status as DiagnosticTaskStatus)
        : 'failed';
      const list = groups.get(status) || [];
      list.push(task);
      groups.set(status, list);
    }
    return groups;
  }

  private createTaskItem(task: ProjectTask): TaskTreeItem {
    return new TaskTreeItem(task.label, {
      command: 'vectahubTasks.runProjectTask',
      title: task.label,
      arguments: [task]
    }, this.getIconForKind(task.kind), task.source, task.description);
  }

  private getIconForKind(kind: string): string {
    switch (kind) {
      case 'test': return 'beaker';
      case 'build': return 'package';
      case 'lint': return 'check-all';
      case 'typecheck': return 'symbol-class';
      case 'install': return 'cloud-download';
      case 'dev':
      case 'start':
      case 'serve': return 'rocket';
      case 'preview':
      case 'watch': return 'eye';
      case 'format': return 'edit';
      case 'coverage': return 'graph-line';
      default: return 'play';
    }
  }

  private getIconForStatus(status: string): string {
    switch (status) {
      case 'completed': return 'check';
      case 'processing': return 'sync~spin';
      case 'failed': return 'error';
      case 'cancelled': return 'circle-slash';
      case 'needs-confirmation': return 'question';
      default: return 'warning';
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
