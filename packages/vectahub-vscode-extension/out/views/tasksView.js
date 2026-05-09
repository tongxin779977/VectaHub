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
const treeItems_js_1 = require("./treeItems.js");
const detector_js_1 = require("../project/detector.js");
class TasksViewProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    projectTasks = [];
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (element instanceof treeItems_js_1.CategoryTreeItem) {
            return element.children;
        }
        if (!element) {
            this.projectTasks = await (0, detector_js_1.detectProjectTasks)();
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
            const vhItems = [
                new treeItems_js_1.TaskTreeItem('环境检查 (Doctor)', { command: 'vectahubTasks.doctor', title: '运行环境检查' }, 'pulse'),
                new treeItems_js_1.TaskTreeItem('预览意图', { command: 'vectahubTasks.previewIntent', title: '预览自然语言意图' }, 'search'),
                new treeItems_js_1.TaskTreeItem('执行意图', { command: 'vectahubTasks.runIntent', title: '执行自然语言任务' }, 'play-circle'),
            ];
            return [
                new treeItems_js_1.CategoryTreeItem('项目任务', projectItems),
                new treeItems_js_1.CategoryTreeItem('Git 仓库', gitItems),
                new treeItems_js_1.CategoryTreeItem('VectaHub 核心', vhItems),
                new treeItems_js_1.CategoryTreeItem('最近任务', []),
                new treeItems_js_1.CategoryTreeItem('失败记录', []),
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