import * as vscode from 'vscode';
import { discoverCli } from './cli/discovery.js';
import { initStatusBar, updateStatusBar } from './ui/statusBar.js';
import { registerInstallCliCommand } from './commands/installCli.js';
import { getAutoDetectCli } from './config/settings.js';
import { initOutputChannel, logToOutput } from './ui/output.js';
import { initCliAdapter, runCli } from './cli/adapter.js';
import { startCliDetection, registerCliDetector, getResolvedCliPath, CliDetectionResult } from './cli/readiness.js';
import { registerTasksView } from './views/tasksView.js';
import { registerAdvancedView } from './views/advancedView.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerPreviewIntentCommand } from './commands/previewIntent.js';
import { registerRunIntentCommand } from './commands/runIntent.js';
import { registerRunCommonTaskCommand } from './commands/runCommonTask.js';
import { registerListToolsCommand } from './commands/listTools.js';
import { registerPreviewCurrentWorkflowCommand } from './commands/previewCurrentWorkflow.js';
import { registerRunCurrentWorkflowCommand } from './commands/runCurrentWorkflow.js';
import { registerOpenWorkflowCommand } from './commands/openWorkflow.js';
import { registerTestSecurityCommand } from './commands/testSecurity.js';
import { registerRefreshProjectTasksCommand } from './commands/refreshProjectTasks.js';
import { registerPreviewProjectTaskCommand } from './commands/previewProjectTask.js';
import { registerRunProjectTaskCommand } from './commands/runProjectTask.js';
import { registerListPackageScriptsCommand } from './commands/listPackageScripts.js';
import { registerFetchGhErrorsCommand } from './commands/fetchGhErrors.js';
import { DiagnosticBridge, collectAllDiagnostics, filterDiagnostics } from './project/diagnostic-bridge.js';
import { registerProcessAllQueueCommand } from './commands/processAllQueue.js';
import { registerConfigLlmCommand } from './commands/configLlm.js';
import { registerRunVerifyAllCommand } from './commands/runVerifyAll.js';
import { registerSyncAndFixCiCommand } from './commands/syncAndFixCi.js';
import { registerStartDevServerCommand } from './commands/startDevServer.js';
import { registerStopRunningTaskCommand } from './commands/stopRunningTask.js';
import { registerDocTaskCommands } from './commands/runDocTasks.js';

export function getGlobalCliPath(): string | undefined {
  return getResolvedCliPath();
}

export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = initOutputChannel();
  initCliAdapter(context);
  initStatusBar(context);
  
  logToOutput('VectaHub Tasks extension is now active!');

  const tasksProvider = registerTasksView(context);
  registerAdvancedView(context);

  registerInstallCliCommand(context);
  registerDoctorCommand(context);
  registerConfigLlmCommand(context);
  registerPreviewIntentCommand(context);
  registerRunIntentCommand(context);
  registerRunCommonTaskCommand(context);
  registerListToolsCommand(context);
  registerPreviewCurrentWorkflowCommand(context);
  registerRunCurrentWorkflowCommand(context);
  registerOpenWorkflowCommand(context);
  registerTestSecurityCommand(context);
  registerRefreshProjectTasksCommand(context, tasksProvider);
  registerPreviewProjectTaskCommand(context);
  registerRunProjectTaskCommand(context, tasksProvider);
  registerListPackageScriptsCommand(context);
  registerFetchGhErrorsCommand(context, tasksProvider);
  registerProcessAllQueueCommand(context, tasksProvider);
  registerRunVerifyAllCommand(context, tasksProvider);
  registerSyncAndFixCiCommand(context, tasksProvider);
  registerStartDevServerCommand(context, tasksProvider);
  registerStopRunningTaskCommand(context, tasksProvider);
  registerDocTaskCommands(context, tasksProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahub.getDiagnostics', (args?: { file?: string; severity?: string }) => {
      const all = collectAllDiagnostics();
      const filtered = filterDiagnostics(all, args?.file, args?.severity);
      return filtered;
    }),
  );

  diagnosticBridge = new DiagnosticBridge();
  diagnosticBridge.start()
    .then(port => logToOutput(`Diagnostic bridge started on port ${port}`))
    .catch(err => logToOutput(`Diagnostic bridge failed: ${err}`, 'error'));
  context.subscriptions.push({ dispose: () => diagnosticBridge?.dispose() });

  context.subscriptions.push(outputChannel);

  const cliDetector = async (): Promise<CliDetectionResult> => {
    const result = await discoverCli();
    return {
      exists: result.exists,
      path: result.path,
      version: result.version,
      error: result.error
    };
  };

  if (getAutoDetectCli()) {
    logToOutput('Detecting VectaHub CLI...');
    const state = await startCliDetection(cliDetector);

    if (state === 'ready') {
      updateStatusBar('Ready');
      logToOutput('Running initial VectaHub doctor...');
      interface DoctorResult {
        summary?: { passed: number; failed: number; warnings: number };
      }
      const doctorResult = await runCli<DoctorResult>(['doctor', '--json']);
      if (doctorResult.ok) {
        logToOutput('VectaHub doctor passed.');
      } else {
        logToOutput('VectaHub doctor failed or returned warnings.', 'warn');
        if (doctorResult.data?.summary) {
          logToOutput(`Passed: ${doctorResult.data.summary.passed}, Failed: ${doctorResult.data.summary.failed}, Warnings: ${doctorResult.data.summary.warnings}`, 'warn');
        }
      }
    } else {
      updateStatusBar('CLI Missing');
    }
  } else {
    registerCliDetector(cliDetector);
  }
}

import { ProcessManager } from './cli/process-manager.js';
import { LongRunningTaskManager } from './cli/longRunningTaskManager.js';

let diagnosticBridge: DiagnosticBridge | undefined;

export function deactivate() {
  LongRunningTaskManager.getInstance().stopAll();
  ProcessManager.getInstance().killAll();
  diagnosticBridge?.dispose();
}
