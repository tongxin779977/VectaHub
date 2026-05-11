import * as vscode from 'vscode';

export class VectaHubTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly contextValue?: string,
    public readonly iconPath?: vscode.ThemeIcon | string
  ) {
    super(label, collapsibleState);
  }
}

export class TaskTreeItem extends VectaHubTreeItem {
  public readonly isRunning: boolean;
  public readonly taskId?: string;

  constructor(
    label: string,
    command: vscode.Command,
    icon: string = 'play',
    public readonly source?: string,
    description?: string,
    options?: { isRunning?: boolean; taskId?: string }
  ) {
    const resolvedIcon = options?.isRunning ? 'sync~spin' : icon;
    const contextValue = options?.isRunning ? 'longRunningTask-running' : 'task';
    super(label, vscode.TreeItemCollapsibleState.None, command, contextValue, new vscode.ThemeIcon(resolvedIcon));
    this.description = options?.isRunning ? '运行中' : (description || source);
    this.isRunning = options?.isRunning || false;
    this.taskId = options?.taskId;
    if (source) {
      this.tooltip = `Source: ${source}${description ? '\n' + description : ''}`;
    }
  }
}

export class CategoryTreeItem extends VectaHubTreeItem {
  constructor(label: string, children: VectaHubTreeItem[], options?: { collapsed?: boolean; contextValue?: string }) {
    super(
      label,
      options?.collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      options?.contextValue
    );
    this.children = children;
  }
  public children: VectaHubTreeItem[];
}

export class EmptyStateTreeItem extends VectaHubTreeItem {
  constructor(message: string, icon: string = 'info') {
    super(message, vscode.TreeItemCollapsibleState.None, undefined, 'empty-state', new vscode.ThemeIcon(icon));
  }
}
