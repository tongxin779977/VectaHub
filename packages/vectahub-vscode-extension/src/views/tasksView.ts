import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem, EmptyStateTreeItem } from './treeItems.js';
import { detectProjectTasks } from '../project/detector.js';
import { ProjectTask, isLongRunning } from '../project/taskModel.js';
import { getVectaHubHome } from '../cli/adapter.js';
import { DiagnosticTask, DiagnosticTaskStatus, VALID_DIAGNOSTIC_STATUSES, normalizeDiagnosticQueue } from '../project/diagnosticModel.js';
import { LongRunningTaskManager } from '../cli/longRunningTaskManager.js';
import { getFailedTasks } from '../project/taskHistory.js';
import { isProjectTaskRunning } from '../commands/runProjectTask.js';
import type { DocTaskDisplayStatus, DocTaskFailureKind } from '../project/docTaskState.js';

export interface DocTask {
  id: string;
  label: string;
  status?: DocTaskDisplayStatus;
  lastRunId?: string;
  lastTraceId?: string;
  lastFailureKind?: DocTaskFailureKind;
}

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function getProjectQueuePath(projectRoot: string): string {
  return path.join(getVectaHubHome(), 'projects', djb2Hash(projectRoot), 'diagnostic-queue.json');
}

const DEV_KINDS = ['dev', 'start', 'serve'];
const QUALITY_KINDS = ['test', 'build', 'lint', 'typecheck', 'check', 'validate', 'format', 'format:check', 'coverage', 'storybook'];

export class TasksViewProvider implements vscode.TreeDataProvider<VectaHubTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<VectaHubTreeItem | undefined | null | void> = new vscode.EventEmitter<VectaHubTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<VectaHubTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private projectTasks: ProjectTask[] = [];
  private diagnosticTasks: DiagnosticTask[] = [];
  private queueError: string | undefined;
  private watcher?: vscode.FileSystemWatcher;

  private selectedDocPath: string | undefined;
  private docTasks: DocTask[] = [];
  private selectedAgentCli: string | undefined;
  private isDocParsing: boolean = false;
  private isBatchRunning: boolean = false;

  constructor() {
    this.setupWatcher();
    this.setupLrtListeners();
  }

  private setupWatcher() {
    const home = getVectaHubHome();
    const pattern = new vscode.RelativePattern(home, 'diagnostic-queue.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  private setupLrtListeners() {
    const lrt = LongRunningTaskManager.getInstance();
    lrt.onTaskStarted(() => this.refresh());
    lrt.onTaskStopped(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getSelectedDocPath(): string | undefined {
    return this.selectedDocPath;
  }

  setSelectedDocPath(docPath: string | undefined): void {
    this.selectedDocPath = docPath;
  }

  getDocTasks(): DocTask[] {
    return this.docTasks;
  }

  setDocTasks(tasks: DocTask[]): void {
    this.docTasks = tasks;
  }

  getSelectedAgentCli(): string | undefined {
    return this.selectedAgentCli;
  }

  setSelectedAgentCli(cli: string | undefined): void {
    this.selectedAgentCli = cli;
  }

  getIsDocParsing(): boolean {
    return this.isDocParsing;
  }

  setIsDocParsing(parsing: boolean): void {
    this.isDocParsing = parsing;
  }

  getIsBatchRunning(): boolean {
    return this.isBatchRunning;
  }

  setIsBatchRunning(running: boolean): void {
    this.isBatchRunning = running;
  }

  getTreeItem(element: VectaHubTreeItem): vscode.TreeItem {
    return element;
  }

  readDiagnosticQueue(): { tasks: DiagnosticTask[]; error?: string } {
    const globalQueueFile = path.join(getVectaHubHome(), 'diagnostic-queue.json');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (workspaceFolder) {
      const projectQueueFile = getProjectQueuePath(workspaceFolder.uri.fsPath);
      if (fs.existsSync(projectQueueFile)) {
        try {
          const content = fs.readFileSync(projectQueueFile, 'utf-8');
          const data = JSON.parse(content);
          return normalizeDiagnosticQueue(data);
        } catch {
          return { tasks: [], error: '队列数据不可读' };
        }
      }
    }

    if (!fs.existsSync(globalQueueFile)) {
      return { tasks: [] };
    }
    try {
      const content = fs.readFileSync(globalQueueFile, 'utf-8');
      const data = JSON.parse(content);
      return normalizeDiagnosticQueue(data);
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
      this.addGitAndCISection(categories);
      this.addDocTaskSection(categories);
      this.addOtherScriptsSection(categories, { collapsed: true });
      this.addCoreSection(categories);
      this.addRecentFailuresSection(categories, { collapsed: true });

      return categories;
    }

    return [];
  }

  private addDocTaskSection(categories: CategoryTreeItem[]): void {
    const items: VectaHubTreeItem[] = [];

    const docLabel = this.selectedDocPath ? '更换文档...' : '选择文档文件...';
    const docDesc = this.selectedDocPath ? path.basename(this.selectedDocPath) : undefined;
    items.push(new TaskTreeItem(docLabel, {
      command: 'vectahubTasks.selectDocFile',
      title: '选择开发文档'
    }, 'file-add', undefined, docDesc));

    if (this.selectedDocPath) {
      if (this.isDocParsing) {
        items.push(new TaskTreeItem('正在解析...', undefined, 'sync~spin', 'docTask-disabled'));
      } else if (this.docTasks.length === 0) {
        items.push(new TaskTreeItem('解析文档任务', {
          command: 'vectahubTasks.parseDocTasks',
          title: '调用 LLM 解析文档'
        }, 'lightbulb'));
      } else {
        items.push(new TaskTreeItem('重新解析文档', {
          command: 'vectahubTasks.parseDocTasks',
          title: '重新解析文档任务'
        }, 'refresh'));

        for (const task of this.docTasks) {
          const icon = this.getIconForDocTaskStatus(task.status);
          const contextValue = task.status === 'running' ? 'docTask-running' : 'docTask';
          items.push(new TaskTreeItem(`${task.id}. ${task.label}`, {
            command: task.status === 'running' ? '' : 'vectahubTasks.runDocTask',
            title: `执行任务 ${task.id}`,
            arguments: [task]
          }, icon, contextValue));
        }

        const batchIcon = this.isBatchRunning ? 'sync~spin' : 'run-all';
        const batchContext = this.isBatchRunning ? 'docTask-disabled' : 'docTask';
        const batchCommand = this.isBatchRunning ? '' : 'vectahubTasks.runAllDocTasks';
        items.push(new TaskTreeItem(
          this.isBatchRunning ? '批量执行中...' : '启动全部任务', {
          command: batchCommand,
          title: '一键启动全部文档任务'
        }, batchIcon, batchContext));

        const cliLabel = this.selectedAgentCli
          ? `执行器: ${this.selectedAgentCli}`
          : '选择执行器...';
        items.push(new TaskTreeItem(cliLabel, {
          command: 'vectahubTasks.selectAgentCli',
          title: '选择 Agent CLI 执行器'
        }, 'terminal'));
      }
    }

    categories.push(new CategoryTreeItem('文档任务', items));
  }

  private addDevSection(categories: CategoryTreeItem[]): void {
    const lrt = LongRunningTaskManager.getInstance();
    const hasAnyRunning = this.projectTasks.some(t => DEV_KINDS.includes(t.kind) && lrt.isRunning(t.id));

    const devItems = this.projectTasks
      .filter(t => DEV_KINDS.includes(t.kind))
      .map(t => {
        const running = lrt.isRunning(t.id);
        return new TaskTreeItem(
          t.label,
          { command: 'vectahubTasks.startDevServer', title: t.label, arguments: [t] },
          this.getIconForKind(t.kind),
          t.source,
          t.description,
          { isRunning: running, taskId: t.id }
        );
      });

    if (hasAnyRunning) {
      devItems.push(new TaskTreeItem('停止当前任务', {
        command: 'vectahubTasks.stopRunningTask',
        title: '停止运行中的任务'
      }, 'stop-circle'));
    }

    if (devItems.length > 0) {
      categories.push(new CategoryTreeItem('一键开发', devItems));
    }
  }

  private addQualitySection(categories: CategoryTreeItem[]): void {
    const qualityItems = this.projectTasks
      .filter(t => QUALITY_KINDS.includes(t.kind))
      .map(t => this.createTaskItem(t));

    qualityItems.push(new TaskTreeItem('一键验证全部', {
      command: 'vectahubTasks.runVerifyAll',
      title: '运行 format:check / typecheck / lint / test / build'
    }, 'play-circle'));

    categories.push(new CategoryTreeItem('质量检查', qualityItems));
  }

  private addGitAndCISection(categories: CategoryTreeItem[]): void {
    const gitAvailable = this.projectTasks.some(t => t.source === 'git');

    const gitItems = gitAvailable
      ? this.projectTasks
          .filter(t => t.source === 'git')
          .map(t => new TaskTreeItem(t.label, {
            command: 'vectahubTasks.runProjectTask',
            title: t.label,
            arguments: [t]
          }, 'git-compare', t.source))
      : [];

    if (!gitAvailable) return;

    const ciItems: VectaHubTreeItem[] = [
      new TaskTreeItem('同步并修复', {
        command: 'vectahubTasks.syncAndFixCi',
        title: '拉取 CI 错误并自动修复'
      }, 'sync')
    ];

    const queueChildren: VectaHubTreeItem[] = [];
    if (this.queueError) {
      queueChildren.push(new EmptyStateTreeItem(this.queueError, 'warning'));
    } else if (this.diagnosticTasks.length > 0) {
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

      for (const status of statusOrder) {
        const tasks = statusGroups.get(status);
        if (!tasks || tasks.length === 0) continue;

        const statusItems = tasks.map(t => {
          const icon = this.getIconForStatus(t.status);
          return new TaskTreeItem(t.title, {
            command: 'vectahubTasks.removeQueueTask',
            title: t.title,
            arguments: [t.id]
          }, icon, 'queueTask', t.description);
        });

        queueChildren.push(new CategoryTreeItem(`${statusLabels[status] || status} (${tasks.length})`, statusItems));
      }
    }

    const allItems = [...gitItems, ...ciItems, ...queueChildren];
    if (allItems.length > 0) {
      categories.push(new CategoryTreeItem('Git & CI', allItems, { contextValue: 'queueCategory' }));
    }
  }

  private addRecentFailuresSection(categories: CategoryTreeItem[], options?: { collapsed?: boolean }): void {
    const failures = getFailedTasks(5);
    if (failures.length === 0) return;

    const items = failures.map(record => {
      const timeStr = record.endedAt
        ? new Date(record.endedAt).toLocaleTimeString()
        : '';
      const desc = record.errorMessage
        ? `${timeStr} · ${record.errorMessage}`
        : timeStr;
      return new TaskTreeItem(record.label, {
        command: 'workbench.action.output.toggleOutput',
        title: `查看 ${record.label} 详情`
      }, 'error', 'failed', desc);
    });

    categories.push(new CategoryTreeItem('最近失败', items, options));
  }

  private addCoreSection(categories: CategoryTreeItem[]): void {
    const vhItems = [
      new TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
      new TaskTreeItem('执行自定义意图', { command: 'vectahubTasks.runIntent', title: '输入自然语言意图' }, 'comment')
    ];
    categories.push(new CategoryTreeItem('VectaHub 核心', vhItems));
  }

  private addOtherScriptsSection(categories: CategoryTreeItem[], options?: { collapsed?: boolean }): void {
    const otherPkgItems = this.projectTasks
      .filter(t => t.source === 'package-json' && !DEV_KINDS.includes(t.kind) && !QUALITY_KINDS.includes(t.kind) && t.kind !== 'install')
      .map(t => {
        if (isLongRunning(t.kind)) {
          const lrt = LongRunningTaskManager.getInstance();
          const running = lrt.isRunning(t.id);
          return new TaskTreeItem(
            t.label,
            { command: 'vectahubTasks.startDevServer', title: t.label, arguments: [t] },
            this.getIconForKind(t.kind),
            t.source,
            t.description,
            { isRunning: running, taskId: t.id }
          );
        }
        return this.createTaskItem(t);
      });

    if (otherPkgItems.length > 0) {
      categories.push(new CategoryTreeItem('项目脚本', otherPkgItems, options));
    }
  }

  groupDiagnosticsByStatus(): Map<DiagnosticTaskStatus, DiagnosticTask[]> {
    const groups = new Map<DiagnosticTaskStatus, DiagnosticTask[]>();
    for (const task of this.diagnosticTasks) {
      const status: DiagnosticTaskStatus = VALID_DIAGNOSTIC_STATUSES.includes(task.status as DiagnosticTaskStatus)
        ? (task.status as DiagnosticTaskStatus)
        : 'needs-confirmation';
      const list = groups.get(status) || [];
      list.push(task);
      groups.set(status, list);
    }
    return groups;
  }

  private createTaskItem(task: ProjectTask): TaskTreeItem {
    const running = isProjectTaskRunning(task.id);
    return new TaskTreeItem(task.label, {
      command: running ? '' : 'vectahubTasks.runProjectTask',
      title: task.label,
      arguments: [task]
    }, running ? 'loading~spin' : this.getIconForKind(task.kind), task.source, task.description);
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

  private getIconForDocTaskStatus(status?: string): string {
    switch (status) {
      case 'ready': return 'clock';
      case 'preflight': return 'search';
      case 'running': return 'loading~spin';
      case 'changed': return 'diff';
      case 'success': return 'pass';
      case 'cancelled': return 'circle-slash';
      case 'needs-confirmation': return 'question';
      case 'failed': return 'error';
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
