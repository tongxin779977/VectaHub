import * as vscode from 'vscode';
import { TasksViewProvider } from '../views/tasksView.js';

export function registerRefreshProjectTasksCommand(context: vscode.ExtensionContext, provider: TasksViewProvider) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.refreshProjectTasks', () => {
    provider.refresh();
  });
  context.subscriptions.push(disposable);
}