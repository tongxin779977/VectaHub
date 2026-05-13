"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksViewProvider = void 0;
exports.registerTasksView = registerTasksView;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const treeItems_js_1 = require("./treeItems.js");
const detector_js_1 = require("../project/detector.js");
const taskModel_js_1 = require("../project/taskModel.js");
const adapter_js_1 = require("../cli/adapter.js");
const diagnosticModel_js_1 = require("../project/diagnosticModel.js");
const longRunningTaskManager_js_1 = require("../cli/longRunningTaskManager.js");
const taskHistory_js_1 = require("../project/taskHistory.js");
const runProjectTask_js_1 = require("../commands/runProjectTask.js");
function djb2Hash(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}
function getProjectQueuePath(projectRoot) {
    return path.join((0, adapter_js_1.getVectaHubHome)(), 'projects', djb2Hash(projectRoot), 'diagnostic-queue.json');
}
const DEV_KINDS = ['dev', 'start', 'serve'];
const QUALITY_KINDS = ['test', 'build', 'lint', 'typecheck', 'check', 'validate', 'format', 'format:check', 'coverage', 'storybook'];
class TasksViewProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    projectTasks = [];
    diagnosticTasks = [];
    queueError;
    watcher;
    selectedDocPath;
    docTasks = [];
    selectedAgentCli;
    isDocParsing = false;
    isBatchRunning = false;
    constructor() {
        this.setupWatcher();
        this.setupLrtListeners();
    }
    setupWatcher() {
        const home = (0, adapter_js_1.getVectaHubHome)();
        const pattern = new vscode.RelativePattern(home, 'diagnostic-queue.json');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.watcher.onDidChange(() => this.refresh());
        this.watcher.onDidCreate(() => this.refresh());
        this.watcher.onDidDelete(() => this.refresh());
    }
    setupLrtListeners() {
        const lrt = longRunningTaskManager_js_1.LongRunningTaskManager.getInstance();
        lrt.onTaskStarted(() => this.refresh());
        lrt.onTaskStopped(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getSelectedDocPath() {
        return this.selectedDocPath;
    }
    setSelectedDocPath(docPath) {
        this.selectedDocPath = docPath;
    }
    getDocTasks() {
        return this.docTasks;
    }
    setDocTasks(tasks) {
        this.docTasks = tasks;
    }
    getSelectedAgentCli() {
        return this.selectedAgentCli;
    }
    setSelectedAgentCli(cli) {
        this.selectedAgentCli = cli;
    }
    getIsDocParsing() {
        return this.isDocParsing;
    }
    setIsDocParsing(parsing) {
        this.isDocParsing = parsing;
    }
    getIsBatchRunning() {
        return this.isBatchRunning;
    }
    setIsBatchRunning(running) {
        this.isBatchRunning = running;
    }
    getTreeItem(element) {
        return element;
    }
    readDiagnosticQueue() {
        const globalQueueFile = path.join((0, adapter_js_1.getVectaHubHome)(), 'diagnostic-queue.json');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const projectQueueFile = getProjectQueuePath(workspaceFolder.uri.fsPath);
            if (fs.existsSync(projectQueueFile)) {
                try {
                    const content = fs.readFileSync(projectQueueFile, 'utf-8');
                    const data = JSON.parse(content);
                    return (0, diagnosticModel_js_1.normalizeDiagnosticQueue)(data);
                }
                catch {
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
            return (0, diagnosticModel_js_1.normalizeDiagnosticQueue)(data);
        }
        catch {
            return { tasks: [], error: '队列数据不可读' };
        }
    }
    async getChildren(element) {
        if (element instanceof treeItems_js_1.CategoryTreeItem) {
            return element.children;
        }
        if (!element) {
            this.projectTasks = await (0, detector_js_1.detectProjectTasks)();
            const queueResult = this.readDiagnosticQueue();
            this.diagnosticTasks = queueResult.tasks;
            this.queueError = queueResult.error;
            const categories = [];
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
    addDocTaskSection(categories) {
        const items = [];
        const docLabel = this.selectedDocPath ? '更换文档...' : '选择文档文件...';
        const docDesc = this.selectedDocPath ? path.basename(this.selectedDocPath) : undefined;
        items.push(new treeItems_js_1.TaskTreeItem(docLabel, {
            command: 'vectahubTasks.selectDocFile',
            title: '选择开发文档'
        }, 'file-add', undefined, docDesc));
        if (this.selectedDocPath) {
            if (this.isDocParsing) {
                items.push(new treeItems_js_1.TaskTreeItem('正在解析...', undefined, 'sync~spin', 'docTask-disabled'));
            }
            else if (this.docTasks.length === 0) {
                items.push(new treeItems_js_1.TaskTreeItem('解析文档任务', {
                    command: 'vectahubTasks.parseDocTasks',
                    title: '调用 LLM 解析文档'
                }, 'lightbulb'));
            }
            else {
                items.push(new treeItems_js_1.TaskTreeItem('重新解析文档', {
                    command: 'vectahubTasks.parseDocTasks',
                    title: '重新解析文档任务'
                }, 'refresh'));
                for (const task of this.docTasks) {
                    const icon = this.getIconForDocTaskStatus(task.status);
                    const contextValue = task.status === 'running' ? 'docTask-running' : 'docTask';
                    items.push(new treeItems_js_1.TaskTreeItem(`${task.id}. ${task.label}`, {
                        command: task.status === 'running' ? '' : 'vectahubTasks.runDocTask',
                        title: `执行任务 ${task.id}`,
                        arguments: [task]
                    }, icon, contextValue));
                }
                const batchIcon = this.isBatchRunning ? 'sync~spin' : 'run-all';
                const batchContext = this.isBatchRunning ? 'docTask-disabled' : 'docTask';
                const batchCommand = this.isBatchRunning ? '' : 'vectahubTasks.runAllDocTasks';
                items.push(new treeItems_js_1.TaskTreeItem(this.isBatchRunning ? '批量执行中...' : '启动全部任务', {
                    command: batchCommand,
                    title: '一键启动全部文档任务'
                }, batchIcon, batchContext));
                const cliLabel = this.selectedAgentCli
                    ? `执行器: ${this.selectedAgentCli}`
                    : '选择执行器...';
                items.push(new treeItems_js_1.TaskTreeItem(cliLabel, {
                    command: 'vectahubTasks.selectAgentCli',
                    title: '选择 Agent CLI 执行器'
                }, 'terminal'));
            }
        }
        categories.push(new treeItems_js_1.CategoryTreeItem('文档任务', items));
    }
    addDevSection(categories) {
        const lrt = longRunningTaskManager_js_1.LongRunningTaskManager.getInstance();
        const hasAnyRunning = this.projectTasks.some(t => DEV_KINDS.includes(t.kind) && lrt.isRunning(t.id));
        const devItems = this.projectTasks
            .filter(t => DEV_KINDS.includes(t.kind))
            .map(t => {
            const running = lrt.isRunning(t.id);
            return new treeItems_js_1.TaskTreeItem(t.label, { command: 'vectahubTasks.startDevServer', title: t.label, arguments: [t] }, this.getIconForKind(t.kind), t.source, t.description, { isRunning: running, taskId: t.id });
        });
        if (hasAnyRunning) {
            devItems.push(new treeItems_js_1.TaskTreeItem('停止当前任务', {
                command: 'vectahubTasks.stopRunningTask',
                title: '停止运行中的任务'
            }, 'stop-circle'));
        }
        if (devItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('一键开发', devItems));
        }
    }
    addQualitySection(categories) {
        const qualityItems = this.projectTasks
            .filter(t => QUALITY_KINDS.includes(t.kind))
            .map(t => this.createTaskItem(t));
        qualityItems.push(new treeItems_js_1.TaskTreeItem('一键验证全部', {
            command: 'vectahubTasks.runVerifyAll',
            title: '运行 format:check / typecheck / lint / test / build'
        }, 'play-circle'));
        categories.push(new treeItems_js_1.CategoryTreeItem('质量检查', qualityItems));
    }
    addGitAndCISection(categories) {
        const gitAvailable = this.projectTasks.some(t => t.source === 'git');
        const gitItems = gitAvailable
            ? this.projectTasks
                .filter(t => t.source === 'git')
                .map(t => new treeItems_js_1.TaskTreeItem(t.label, {
                command: 'vectahubTasks.runProjectTask',
                title: t.label,
                arguments: [t]
            }, 'git-compare', t.source))
            : [];
        if (!gitAvailable)
            return;
        const ciItems = [
            new treeItems_js_1.TaskTreeItem('同步并修复', {
                command: 'vectahubTasks.syncAndFixCi',
                title: '拉取 CI 错误并自动修复'
            }, 'sync')
        ];
        const queueChildren = [];
        if (this.queueError) {
            queueChildren.push(new treeItems_js_1.EmptyStateTreeItem(this.queueError, 'warning'));
        }
        else if (this.diagnosticTasks.length > 0) {
            const statusGroups = this.groupDiagnosticsByStatus();
            const statusOrder = ['pending', 'processing', 'failed', 'needs-confirmation', 'completed', 'cancelled'];
            const statusLabels = {
                'pending': '待处理',
                'processing': '处理中',
                'completed': '已完成',
                'failed': '失败',
                'cancelled': '已取消',
                'needs-confirmation': '待确认'
            };
            for (const status of statusOrder) {
                const tasks = statusGroups.get(status);
                if (!tasks || tasks.length === 0)
                    continue;
                const statusItems = tasks.map(t => {
                    const icon = this.getIconForStatus(t.status);
                    return new treeItems_js_1.TaskTreeItem(t.title, {
                        command: 'vectahubTasks.removeQueueTask',
                        title: t.title,
                        arguments: [t.id]
                    }, icon, 'queueTask', t.description);
                });
                queueChildren.push(new treeItems_js_1.CategoryTreeItem(`${statusLabels[status] || status} (${tasks.length})`, statusItems));
            }
        }
        const allItems = [...gitItems, ...ciItems, ...queueChildren];
        if (allItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('Git & CI', allItems, { contextValue: 'queueCategory' }));
        }
    }
    addRecentFailuresSection(categories, options) {
        const failures = (0, taskHistory_js_1.getFailedTasks)(5);
        if (failures.length === 0)
            return;
        const items = failures.map(record => {
            const timeStr = record.endedAt
                ? new Date(record.endedAt).toLocaleTimeString()
                : '';
            const desc = record.errorMessage
                ? `${timeStr} · ${record.errorMessage}`
                : timeStr;
            return new treeItems_js_1.TaskTreeItem(record.label, {
                command: 'workbench.action.output.toggleOutput',
                title: `查看 ${record.label} 详情`
            }, 'error', 'failed', desc);
        });
        categories.push(new treeItems_js_1.CategoryTreeItem('最近失败', items, options));
    }
    addCoreSection(categories) {
        const vhItems = [
            new treeItems_js_1.TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
            new treeItems_js_1.TaskTreeItem('执行自定义意图', { command: 'vectahubTasks.runIntent', title: '输入自然语言意图' }, 'comment')
        ];
        categories.push(new treeItems_js_1.CategoryTreeItem('VectaHub 核心', vhItems));
    }
    addOtherScriptsSection(categories, options) {
        const otherPkgItems = this.projectTasks
            .filter(t => t.source === 'package-json' && !DEV_KINDS.includes(t.kind) && !QUALITY_KINDS.includes(t.kind) && t.kind !== 'install')
            .map(t => {
            if ((0, taskModel_js_1.isLongRunning)(t.kind)) {
                const lrt = longRunningTaskManager_js_1.LongRunningTaskManager.getInstance();
                const running = lrt.isRunning(t.id);
                return new treeItems_js_1.TaskTreeItem(t.label, { command: 'vectahubTasks.startDevServer', title: t.label, arguments: [t] }, this.getIconForKind(t.kind), t.source, t.description, { isRunning: running, taskId: t.id });
            }
            return this.createTaskItem(t);
        });
        if (otherPkgItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('项目脚本', otherPkgItems, options));
        }
    }
    groupDiagnosticsByStatus() {
        const groups = new Map();
        for (const task of this.diagnosticTasks) {
            const status = diagnosticModel_js_1.VALID_DIAGNOSTIC_STATUSES.includes(task.status)
                ? task.status
                : 'needs-confirmation';
            const list = groups.get(status) || [];
            list.push(task);
            groups.set(status, list);
        }
        return groups;
    }
    createTaskItem(task) {
        const running = (0, runProjectTask_js_1.isProjectTaskRunning)(task.id);
        return new treeItems_js_1.TaskTreeItem(task.label, {
            command: running ? '' : 'vectahubTasks.runProjectTask',
            title: task.label,
            arguments: [task]
        }, running ? 'loading~spin' : this.getIconForKind(task.kind), task.source, task.description);
    }
    getIconForKind(kind) {
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
    getIconForStatus(status) {
        switch (status) {
            case 'completed': return 'check';
            case 'processing': return 'sync~spin';
            case 'failed': return 'error';
            case 'cancelled': return 'circle-slash';
            case 'needs-confirmation': return 'question';
            default: return 'warning';
        }
    }
    getIconForDocTaskStatus(status) {
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
exports.TasksViewProvider = TasksViewProvider;
function registerTasksView(context) {
    const provider = new TasksViewProvider();
    const view = vscode.window.createTreeView('vectahubTasks.tasksView', {
        treeDataProvider: provider,
        showCollapseAll: true
    });
    context.subscriptions.push(view);
    return provider;
}
//# sourceMappingURL=tasksView.js.map