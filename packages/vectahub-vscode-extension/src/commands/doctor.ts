import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';

export function registerDoctorCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.doctor', async () => {
    logToOutput('正在运行 VectaHub 环境检查 (Doctor)...');
    updateStatusBar('Running');
    
    interface DoctorResult {
  summary: { passed: number; warnings: number; failed: number };
}
const result = await runCli<DoctorResult>(['doctor', '--json']);
    
    if (result.ok && result.data) {
      logToOutput('Doctor 检查摘要:');
      logToOutput(`- 通过: ${result.data.summary.passed}`);
      logToOutput(`- 警告: ${result.data.summary.warnings}`);
      logToOutput(`- 失败: ${result.data.summary.failed}`);
      
      if (result.data.summary.failed === 0) {
        vscode.window.showInformationMessage('VectaHub Doctor: 所有检查都已通过！');
        updateStatusBar('Ready');
      } else {
        vscode.window.showErrorMessage(`VectaHub Doctor: 有 ${result.data.summary.failed} 项检查失败。`);
        updateStatusBar('Failed');
      }
    } else {
      logToOutput(`Doctor 运行失败: ${result.error?.message || result.stderr}`, 'error');
      vscode.window.showErrorMessage('VectaHub Doctor 未能成功运行。');
      updateStatusBar('Failed');
    }
  });
  context.subscriptions.push(disposable);
}
