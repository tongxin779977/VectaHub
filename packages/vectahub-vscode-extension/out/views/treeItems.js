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
exports.EmptyStateTreeItem = exports.CategoryTreeItem = exports.TaskTreeItem = exports.VectaHubTreeItem = void 0;
const vscode = __importStar(require("vscode"));
class VectaHubTreeItem extends vscode.TreeItem {
    label;
    collapsibleState;
    command;
    contextValue;
    iconPath;
    constructor(label, collapsibleState, command, contextValue, iconPath) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.contextValue = contextValue;
        this.iconPath = iconPath;
    }
}
exports.VectaHubTreeItem = VectaHubTreeItem;
class TaskTreeItem extends VectaHubTreeItem {
    source;
    isRunning;
    taskId;
    constructor(label, command, icon = 'play', source, description, options) {
        const resolvedIcon = options?.isRunning ? 'sync~spin' : icon;
        const contextValue = options?.isRunning ? 'longRunningTask-running' : 'task';
        super(label, vscode.TreeItemCollapsibleState.None, command, contextValue, new vscode.ThemeIcon(resolvedIcon));
        this.source = source;
        this.description = options?.isRunning ? '运行中' : (description || source);
        this.isRunning = options?.isRunning || false;
        this.taskId = options?.taskId;
        if (source) {
            this.tooltip = `Source: ${source}${description ? '\n' + description : ''}`;
        }
    }
}
exports.TaskTreeItem = TaskTreeItem;
class CategoryTreeItem extends VectaHubTreeItem {
    constructor(label, children, options) {
        super(label, options?.collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded, undefined, options?.contextValue);
        this.children = children;
    }
    children;
}
exports.CategoryTreeItem = CategoryTreeItem;
class EmptyStateTreeItem extends VectaHubTreeItem {
    constructor(message, icon = 'info') {
        super(message, vscode.TreeItemCollapsibleState.None, undefined, 'empty-state', new vscode.ThemeIcon(icon));
    }
}
exports.EmptyStateTreeItem = EmptyStateTreeItem;
//# sourceMappingURL=treeItems.js.map