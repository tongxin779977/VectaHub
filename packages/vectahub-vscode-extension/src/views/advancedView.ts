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
        new CategoryTreeItem('Workflows', [
          new TaskTreeItem('Open Current Workflow', { command: 'vectahubTasks.openWorkflow', title: 'Open Workflow' }, 'file-code'),
          new TaskTreeItem('Preview Current Workflow', { command: 'vectahubTasks.previewCurrentWorkflow', title: 'Preview Workflow' }, 'eye'),
        ]),
        new CategoryTreeItem('Tools', [
          new TaskTreeItem('List Tools', { command: 'vectahubTasks.listTools', title: 'List Tools' }, 'tools'),
        ]),
        new CategoryTreeItem('Security', [
          new TaskTreeItem('Test Selected Command', { command: 'vectahubTasks.testSecurity', title: 'Test Security' }, 'shield'),
        ]),
        new CategoryTreeItem('Settings', [
          new TaskTreeItem('Open Settings', { command: 'workbench.action.openSettings', title: 'Open Settings', arguments: ['vectahubTasks'] }, 'settings-gear'),
          new TaskTreeItem('Install CLI', { command: 'vectahubTasks.installCli', title: 'Install CLI' }, 'cloud-download'),
          new TaskTreeItem('Run Doctor', { command: 'vectahubTasks.doctor', title: 'Run Doctor' }, 'pulse'),
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