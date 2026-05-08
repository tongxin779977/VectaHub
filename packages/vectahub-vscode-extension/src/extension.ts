import * as vscode from 'vscode';
import { discoverCli } from './cli/discovery.js';
import { initStatusBar, updateStatusBar } from './ui/statusBar.js';
import { showCliMissingWarning } from './ui/notifications.js';
import { registerInstallCliCommand } from './commands/installCli.js';
import { getAutoDetectCli } from './config/settings.js';
import { initOutputChannel, logToOutput } from './ui/output.js';
import { initCliAdapter, runCli } from './cli/adapter.js';
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

let globalCliPath: string | undefined;

export function getGlobalCliPath(): string | undefined {
  return globalCliPath;
}

export async function activate(context: vscode.ExtensionContext) {
  // 初始化核心组件
  const outputChannel = initOutputChannel();
  initCliAdapter(context);
  initStatusBar(context);
  
  logToOutput('VectaHub Tasks extension is now active!');

  // 注册视图
  const tasksProvider = registerTasksView(context);
  registerAdvancedView(context);

  // 注册命令
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

  context.subscriptions.push(outputChannel);

  // 自动检测 CLI
  if (getAutoDetectCli()) {
    logToOutput('Detecting VectaHub CLI...');
    const result = await discoverCli();
    if (result.exists) {
      globalCliPath = result.path;
      logToOutput(`VectaHub CLI detected: ${result.version} at ${globalCliPath}`);
      updateStatusBar('Ready');
      
      // 检测成功后自动运行一次 doctor
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
      logToOutput(`VectaHub CLI not found: ${result.error}`, 'error');
      updateStatusBar('CLI Missing');
      showCliMissingWarning();
    }
  }
}

export function deactivate() {}
