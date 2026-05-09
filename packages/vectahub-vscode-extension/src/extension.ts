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
import { registerProcessAllQueueCommand } from './commands/processAllQueue.js';
import { registerRunCheckPipelineCommand } from './commands/runCheckPipeline.js';
import { registerRunDevPipelineCommand } from './commands/runDevPipeline.js';
import { registerStartDevServerCommand } from './commands/startDevServer.js';
import { registerStopRunningTaskCommand } from './commands/stopRunningTask.js';

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
  registerRunCheckPipelineCommand(context, tasksProvider);
  registerRunDevPipelineCommand(context, tasksProvider);
  registerStartDevServerCommand(context, tasksProvider);
  registerStopRunningTaskCommand(context, tasksProvider);

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

export function deactivate() {
  LongRunningTaskManager.getInstance().stopAll();
  ProcessManager.getInstance().killAll();
}
