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
class TasksViewProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    projectTasks = [];
    diagnosticTasks = [];
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
    async getDiagnosticTasks() {
        const queueFile = path.join((0, adapter_js_1.getVectaHubHome)(), 'diagnostic-queue.json');
        if (!fs.existsSync(queueFile)) {
            return [];
        }
        try {
            const content = fs.readFileSync(queueFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return [];
        }
    }
    async getChildren(element) {
        if (element instanceof treeItems_js_1.CategoryTreeItem) {
            return element.children;
        }
        if (!element) {
            this.projectTasks = await (0, detector_js_1.detectProjectTasks)();
            this.diagnosticTasks = await this.getDiagnosticTasks();
            const projectItems = this.projectTasks
                .filter(t => t.source === 'package-json')
                .map(t => new treeItems_js_1.TaskTreeItem(t.label, {
                command: 'vectahubTasks.runProjectTask',
                title: t.label,
                arguments: [t]
            }, this.getIconForKind(t.kind), t.source, t.description));
            const gitItems = this.projectTasks
                .filter(t => t.source === 'git')
                .map(t => new treeItems_js_1.TaskTreeItem(t.label, {
                command: 'vectahubTasks.runProjectTask',
                title: t.label,
                arguments: [t]
            }, 'git-compare', t.source));
            const diagnosticItems = this.diagnosticTasks
                .map(t => {
                const icon = t.status === 'completed' ? 'check' : t.status === 'processing' ? 'sync~spin' : t.status === 'failed' ? 'error' : 'warning';
                return new treeItems_js_1.TaskTreeItem(t.title, {
                    command: 'vectahubTasks.runIntent',
                    title: t.title,
                    arguments: [t.commandToFix]
                }, icon, t.status, t.description);
            });
            const vhItems = [
                new treeItems_js_1.TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
                new treeItems_js_1.TaskTreeItem('获取 GitHub Actions 错误', { command: 'vectahubTasks.fetchGhErrors', title: '拉取最新失败记录' }, 'cloud-download'),
                new treeItems_js_1.TaskTreeItem('一键处理诊断队列', { command: 'vectahubTasks.processAllQueue', title: '开始批量修复' }, 'play-all'),
            ];
            return [
                new treeItems_js_1.CategoryTreeItem('诊断与维护队列', diagnosticItems),
                new treeItems_js_1.CategoryTreeItem('项目任务', projectItems),
                new treeItems_js_1.CategoryTreeItem('Git 仓库', gitItems),
                new treeItems_js_1.CategoryTreeItem('VectaHub 核心', vhItems),
            ];
        }
        return [];
    }
    getIconForKind(kind) {
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