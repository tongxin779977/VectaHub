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
exports.initStatusBar = initStatusBar;
exports.updateStatusBar = updateStatusBar;
const vscode = __importStar(require("vscode"));
let statusBarItem;
function initStatusBar(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    updateStatusBar('Ready');
    statusBarItem.show();
}
function updateStatusBar(status) {
    if (!statusBarItem)
        return;
    const statusTextMap = {
        'Ready': '就绪',
        'CLI Missing': 'CLI 缺失',
        'Running': '运行中...',
        'Failed': '失败',
        'Dev Server': 'Dev Server 运行中'
    };
    statusBarItem.text = `$(tasklist) VectaHub: ${statusTextMap[status]}`;
    switch (status) {
        case 'CLI Missing':
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarItem.tooltip = 'VectaHub CLI 未找到。点击安装。';
            statusBarItem.command = 'vectahubTasks.installCli';
            break;
        case 'Failed':
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarItem.tooltip = '上个任务执行失败。点击查看输出。';
            statusBarItem.command = 'workbench.action.output.toggleOutput';
            break;
        case 'Dev Server':
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'VectaHub Dev Server 正在运行。点击查看任务面板。';
            statusBarItem.command = 'vectahubTasks.tasksView.focus';
            break;
        default:
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = `VectaHub 已${statusTextMap[status]}`;
            statusBarItem.command = 'vectahubTasks.tasksView.focus';
    }
}
//# sourceMappingURL=statusBar.js.map