import * as vscode from 'vscode';
import { logToOutput } from '../ui/output.js';

export function registerConfigLlmCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.configLlm', async () => {
    logToOutput('正在启动 LLM 配置流程...');

    const terminal = vscode.window.createTerminal({
      name: 'VectaHub LLM 配置',
      env: {
        VECTAHUB_NON_INTERACTIVE: undefined
      }
    });
    terminal.show();
    terminal.sendText('vectahub setup', false);
    vscode.window.showInformationMessage('请在终端中按照提示完成 LLM 配置');
  });
  context.subscriptions.push(disposable);
}
