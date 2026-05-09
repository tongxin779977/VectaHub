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
const adapter_js_1 = require("../cli/adapter.js");
const DEV_KINDS = ['dev', 'start', 'serve'];
const QUALITY_KINDS = ['test', 'build', 'lint', 'typecheck', 'check', 'validate', 'format', 'format:check', 'coverage', 'storybook'];
class TasksViewProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    projectTasks = [];
    diagnosticTasks = [];
    queueError;
    watcher;
    constructor() {
        this.setupWatcher();
    }
    setupWatcher() {
        const home = (0, adapter_js_1.getVectaHubHome)();
        const pattern = new vscode.RelativePattern(home, 'diagnostic-queue.json');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.watcher.onDidChange(() => this.refresh());
        this.watcher.onDidCreate(() => this.refresh());
        this.watcher.onDidDelete(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    readDiagnosticQueue() {
        const queueFile = path.join((0, adapter_js_1.getVectaHubHome)(), 'diagnostic-queue.json');
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
                tasks: data.filter((t) => t && t.id && t.title && t.status)
            };
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
            this.addCISection(categories);
            this.addQueueSection(categories);
            this.addGitSection(categories);
            this.addCoreSection(categories);
            this.addOtherScriptsSection(categories);
            return categories;
        }
        return [];
    }
    addDevSection(categories) {
        const devItems = this.projectTasks
            .filter(t => DEV_KINDS.includes(t.kind))
            .map(t => this.createTaskItem(t));
        if (devItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('一键开发', devItems));
        }
    }
    addQualitySection(categories) {
        const qualityItems = this.projectTasks
            .filter(t => QUALITY_KINDS.includes(t.kind))
            .map(t => this.createTaskItem(t));
        if (qualityItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('质量检查', qualityItems));
        }
    }
    addCISection(categories) {
        const gitAvailable = this.projectTasks.some(t => t.source === 'git');
        if (!gitAvailable)
            return;
        const ciItems = [
            new treeItems_js_1.TaskTreeItem('拉取 GitHub Actions 错误', {
                command: 'vectahubTasks.fetchGhErrors',
                title: '拉取最新失败记录'
            }, 'cloud-download'),
            new treeItems_js_1.TaskTreeItem('自动处理诊断队列', {
                command: 'vectahubTasks.processAllQueue',
                title: '开始批量修复'
            }, 'play-all')
        ];
        categories.push(new treeItems_js_1.CategoryTreeItem('CI 修复', ciItems));
    }
    addQueueSection(categories) {
        if (this.queueError) {
            categories.push(new treeItems_js_1.CategoryTreeItem('自动化队列', [
                new treeItems_js_1.EmptyStateTreeItem(this.queueError, 'warning')
            ]));
            return;
        }
        if (this.diagnosticTasks.length === 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('自动化队列', [
                new treeItems_js_1.EmptyStateTreeItem('队列为空，当前无待处理诊断', 'check')
            ]));
            return;
        }
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
        const queueChildren = [];
        for (const status of statusOrder) {
            const tasks = statusGroups.get(status);
            if (!tasks || tasks.length === 0)
                continue;
            const statusItems = tasks.map(t => {
                const icon = this.getIconForStatus(t.status);
                return new treeItems_js_1.TaskTreeItem(t.title, {
                    command: 'vectahubTasks.runIntent',
                    title: t.title,
                    arguments: [t.commandToFix]
                }, icon, t.status, t.description);
            });
            queueChildren.push(new treeItems_js_1.CategoryTreeItem(`${statusLabels[status] || status} (${tasks.length})`, statusItems));
        }
        if (queueChildren.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('自动化队列', queueChildren));
        }
    }
    addGitSection(categories) {
        const gitItems = this.projectTasks
            .filter(t => t.source === 'git')
            .map(t => new treeItems_js_1.TaskTreeItem(t.label, {
            command: 'vectahubTasks.runProjectTask',
            title: t.label,
            arguments: [t]
        }, 'git-compare', t.source));
        if (gitItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('Git 仓库', gitItems));
        }
    }
    addCoreSection(categories) {
        const vhItems = [
            new treeItems_js_1.TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
            new treeItems_js_1.TaskTreeItem('执行自定义意图', { command: 'vectahubTasks.runIntent', title: '输入自然语言意图' }, 'comment')
        ];
        categories.push(new treeItems_js_1.CategoryTreeItem('VectaHub 核心', vhItems));
    }
    addOtherScriptsSection(categories) {
        const otherPkgItems = this.projectTasks
            .filter(t => t.source === 'package-json' && !DEV_KINDS.includes(t.kind) && !QUALITY_KINDS.includes(t.kind) && t.kind !== 'install')
            .map(t => this.createTaskItem(t));
        if (otherPkgItems.length > 0) {
            categories.push(new treeItems_js_1.CategoryTreeItem('其他项目脚本', otherPkgItems));
        }
    }
    groupDiagnosticsByStatus() {
        const groups = new Map();
        for (const task of this.diagnosticTasks) {
            const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'needs-confirmation'];
            const status = validStatuses.includes(task.status)
                ? task.status
                : 'failed';
            const list = groups.get(status) || [];
            list.push(task);
            groups.set(status, list);
        }
        return groups;
    }
    createTaskItem(task) {
        return new treeItems_js_1.TaskTreeItem(task.label, {
            command: 'vectahubTasks.runProjectTask',
            title: task.label,
            arguments: [task]
        }, this.getIconForKind(task.kind), task.source, task.description);
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