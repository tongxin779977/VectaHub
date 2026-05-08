import * as vscode from 'vscode';

export function registerInstallCliCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.installCli', () => {
    const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
    
    let installCommand: string;
    let message: string;
    let cwd: string | undefined;
    
    if (isDevelopment) {
      // 开发环境：使用本地链接命令
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      cwd = workspaceFolder;
      installCommand = 'npm install -g .';
      message = '请在终端中运行此命令以链接本地 CLI。确保当前目录是项目根目录。';
    } else {
      // 生产环境：使用 npm 全局安装
      installCommand = 'npm install -g vectahub';
      message = '请在终端中运行命令以安装 VectaHub CLI。';
    }
    
    const terminalOptions: vscode.TerminalOptions = {
      name: 'VectaHub 安装',
      cwd: cwd
    };
    
    const terminal = vscode.window.createTerminal(terminalOptions);
    terminal.show();
    terminal.sendText(installCommand, false);
    vscode.window.showInformationMessage(message);
  });
  context.subscriptions.push(disposable);
}
