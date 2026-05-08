import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

export function initOutputChannel() {
  outputChannel = vscode.window.createOutputChannel('VectaHub Tasks');
  return outputChannel;
}

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('VectaHub Tasks');
  }
  return outputChannel;
}

export function logToOutput(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const channel = getOutputChannel();
  const timestamp = new Date().toLocaleTimeString();
  channel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}
