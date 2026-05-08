import * as vscode from 'vscode';

export function registerInstallCliCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.installCli', () => {
    const terminal = vscode.window.createTerminal('VectaHub Installation');
    terminal.show();
    terminal.sendText('npm install -g vectahub', false);
    vscode.window.showInformationMessage('Please run the command in the terminal to install VectaHub CLI.');
  });
  context.subscriptions.push(disposable);
}
