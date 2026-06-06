import * as vscode from 'vscode';
import { CategoryTreeItem, TaskTreeItem, VectaHubTreeItem } from './treeItems.js';

export class AdvancedViewProvider implements vscode.TreeDataProvider<VectaHubTreeItem> {
  getTreeItem(element: VectaHubTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: VectaHubTreeItem): Thenable<VectaHubTreeItem[]> {
    if (element instanceof CategoryTreeItem) {
      return Promise.resolve(element.children);
    }

    if (!element) {
      return Promise.resolve([
        new CategoryTreeItem('工作流 (Workflows)', [
          new TaskTreeItem('打开当前工作流', { command: 'vectahubTasks.openWorkflow', title: '打开工作流文件' }, 'file-code'),
          new TaskTreeItem('预览当前工作流', { command: 'vectahubTasks.previewCurrentWorkflow', title: '预览工作流步骤' }, 'eye'),
        ]),
        new CategoryTreeItem('工具管理 (Tools)', [
          new TaskTreeItem('查看已注册工具', { command: 'vectahubTasks.listTools', title: '列出所有 CLI 工具' }, 'tools'),
        ]),
        new CategoryTreeItem('安全检测 (Security)', [
          new TaskTreeItem('测试选中文本/命令', { command: 'vectahubTasks.testSecurity', title: '安全合规性测试' }, 'shield'),
        ]),
        new CategoryTreeItem('设置与引导', [
          new TaskTreeItem('打开插件设置', { command: 'workbench.action.openSettings', title: '配置 VectaHub', arguments: ['vectahubTasks'] }, 'settings-gear'),
          new TaskTreeItem('安装 CLI 工具', { command: 'vectahubTasks.installCli', title: '安装全局 vectahub' }, 'cloud-download'),
          new TaskTreeItem('配置 LLM', { command: 'vectahubTasks.configLlm', title: '配置 AI LLM 提供商' }, 'hubot'),
          new TaskTreeItem('运行 Doctor', { command: 'vectahubTasks.doctor', title: '环境诊断' }, 'pulse'),
        ]),
      ]);
    }

    return Promise.resolve([]);
  }
}

export function registerAdvancedView(context: vscode.ExtensionContext) {
  const provider = new AdvancedViewProvider();
  const view = vscode.window.createTreeView('vectahubTasks.advancedView', {
    treeDataProvider: provider
  });
  context.subscriptions.push(view);
  return provider;
}
