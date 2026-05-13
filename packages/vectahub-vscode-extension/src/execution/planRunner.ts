import * as vscode from 'vscode';
import { ExecutionPlan } from './plan';
import { runCli } from '../cli/adapter.js';
import { getLogTruncationLimit } from '../config/settings.js';

export class PlanRunner {
  private outputChannel: vscode.OutputChannel;
  private defaultTimeout = 120000;
  private previewTimeout = 60000;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async run(plan: ExecutionPlan, options?: { silent?: boolean }): Promise<void> {
    this.outputChannel.appendLine(`\n[PlanRunner] Running Plan: ${plan.label}`);
    this.outputChannel.appendLine(`[PlanRunner] Type: ${plan.type}, Mode: ${plan.mode}`);

    try {
      let result;
      switch (plan.type) {
        case 'intent':
          result = await runCli([
            'run',
            '--mode', plan.mode,
            '--json',
            plan.intent
          ], { cwd: plan.cwd, timeout: this.defaultTimeout });
          break;
        case 'command':
          result = await runCli([
            'run-command',
            '--mode', plan.mode,
            '--json',
            '--',
            plan.command.cli,
            ...plan.command.args
          ], { cwd: plan.cwd, timeout: this.defaultTimeout });
          break;
        case 'workflowFile':
          result = await runCli([
            'run',
            '--mode', plan.mode,
            '--json',
            plan.file
          ], { cwd: plan.cwd, timeout: this.defaultTimeout });
          break;
        case 'capability':
          result = await runCli([
            'run',
            '--mode', plan.mode,
            '--json',
            plan.goal?.originalInput || plan.label
          ], { cwd: plan.cwd, timeout: this.defaultTimeout });
          break;
      }

      const resultStr = JSON.stringify(result, null, 2);
      const limit = getLogTruncationLimit();
      const truncated = resultStr.length > limit ? resultStr.slice(0, limit) + '... [truncated]' : resultStr;
      this.outputChannel.appendLine(`[PlanRunner] Result: ${truncated}`);
      
      if (result && result.ok === false) {
        const error = result.error || { message: 'Unknown error' };
        const errorCode = (error as { code?: string }).code || 'N/A';
        const errorMsg = `Task Failed: ${error.message} (${errorCode})`;
        if (!options?.silent) {
          vscode.window.showErrorMessage(errorMsg);
        }
        throw new Error(errorMsg);
      } else {
        if (!options?.silent) {
          vscode.window.showInformationMessage(`Task Completed: ${plan.label}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[PlanRunner] Error: ${msg}`);
      if (!options?.silent) {
        vscode.window.showErrorMessage(`Execution Error: ${msg}`);
      }
      throw error;
    }
  }

  async preview(plan: ExecutionPlan): Promise<{ ok: boolean; error?: { message: string; code?: string } } | undefined> {
    this.outputChannel.appendLine(`\n[PlanRunner] Previewing Plan: ${plan.label}`);
    
    switch (plan.type) {
      case 'intent':
        return runCli([
          'run',
          '--dry-run',
          '--json',
          plan.intent
        ], { cwd: plan.cwd, timeout: this.previewTimeout });
      case 'command':
        return runCli([
          'run-command',
          '--dry-run',
          '--json',
          '--',
          plan.command.cli,
          ...plan.command.args
        ], { cwd: plan.cwd, timeout: this.previewTimeout });
      case 'workflowFile':
        return runCli([
          'run',
          '--dry-run',
          '--json',
          plan.file
        ], { cwd: plan.cwd, timeout: this.previewTimeout });
      case 'capability':
        return runCli([
          'run',
          '--dry-run',
          '--json',
          plan.goal?.originalInput || plan.label
        ], { cwd: plan.cwd, timeout: this.previewTimeout });
    }
  }
}
