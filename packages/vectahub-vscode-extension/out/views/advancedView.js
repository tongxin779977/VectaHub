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
exports.AdvancedViewProvider = void 0;
exports.registerAdvancedView = registerAdvancedView;
const vscode = __importStar(require("vscode"));
const treeItems_js_1 = require("./treeItems.js");
class AdvancedViewProvider {
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element instanceof treeItems_js_1.CategoryTreeItem) {
            return Promise.resolve(element.children);
        }
        if (!element) {
            return Promise.resolve([
                new treeItems_js_1.CategoryTreeItem('工作流 (Workflows)', [
                    new treeItems_js_1.TaskTreeItem('打开当前工作流', { command: 'vectahubTasks.openWorkflow', title: '打开工作流文件' }, 'file-code'),
                    new treeItems_js_1.TaskTreeItem('预览当前工作流', { command: 'vectahubTasks.previewCurrentWorkflow', title: '预览工作流步骤' }, 'eye'),
                ]),
                new treeItems_js_1.CategoryTreeItem('工具管理 (Tools)', [
                    new treeItems_js_1.TaskTreeItem('查看已注册工具', { command: 'vectahubTasks.listTools', title: '列出所有 CLI 工具' }, 'tools'),
                ]),
                new treeItems_js_1.CategoryTreeItem('安全检测 (Security)', [
                    new treeItems_js_1.TaskTreeItem('测试选中文本/命令', { command: 'vectahubTasks.testSecurity', title: '安全合规性测试' }, 'shield'),
                ]),
                new treeItems_js_1.CategoryTreeItem('设置与引导', [
                    new treeItems_js_1.TaskTreeItem('打开插件设置', { command: 'workbench.action.openSettings', title: '配置 VectaHub', arguments: ['vectahubTasks'] }, 'settings-gear'),
                    new treeItems_js_1.TaskTreeItem('安装 CLI 工具', { command: 'vectahubTasks.installCli', title: '安装全局 vectahub' }, 'cloud-download'),
                    new treeItems_js_1.TaskTreeItem('配置 LLM', { command: 'vectahubTasks.configLlm', title: '配置 AI LLM 提供商' }, 'hubot'),
                    new treeItems_js_1.TaskTreeItem('运行 Doctor', { command: 'vectahubTasks.doctor', title: '环境诊断' }, 'pulse'),
                ]),
            ]);
        }
        return Promise.resolve([]);
    }
}
exports.AdvancedViewProvider = AdvancedViewProvider;
function registerAdvancedView(context) {
    const provider = new AdvancedViewProvider();
    const view = vscode.window.createTreeView('vectahubTasks.advancedView', {
        treeDataProvider: provider
    });
    context.subscriptions.push(view);
    return provider;
}
//# sourceMappingURL=advancedView.js.map