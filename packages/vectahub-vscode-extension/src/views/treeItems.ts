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
  constructor(
    label: string,
    command: vscode.Command,
    icon: string = 'play'
  ) {
    super(label, vscode.TreeItemCollapsibleState.None, command, 'task', new vscode.ThemeIcon(icon));
  }
}

export class CategoryTreeItem extends VectaHubTreeItem {
  constructor(label: string, children: VectaHubTreeItem[]) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.children = children;
  }
  public children: VectaHubTreeItem[];
}
