import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { updateStatusBar } from '../ui/statusBar.js';

export function registerDoctorCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.doctor', async () => {
    logToOutput('Running VectaHub Doctor...');
    updateStatusBar('Running');
    
    const result = await runCli<any>(['doctor', '--json']);
    
    if (result.ok && result.data) {
      logToOutput('Doctor Summary:');
      logToOutput(`- Passed: ${result.data.summary.passed}`);
      logToOutput(`- Warnings: ${result.data.summary.warnings}`);
      logToOutput(`- Failed: ${result.data.summary.failed}`);
      
      if (result.data.summary.failed === 0) {
        vscode.window.showInformationMessage('VectaHub Doctor: All checks passed!');
        updateStatusBar('Ready');
      } else {
        vscode.window.showErrorMessage(`VectaHub Doctor: ${result.data.summary.failed} checks failed.`);
        updateStatusBar('Failed');
      }
    } else {
      logToOutput(`Doctor failed: ${result.error?.message || result.stderr}`, 'error');
      vscode.window.showErrorMessage('VectaHub Doctor failed to run.');
      updateStatusBar('Failed');
    }
  });
  context.subscriptions.push(disposable);
}
