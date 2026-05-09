import * as vscode from 'vscode';
import { ExecutionPlan } from './plan';
import { runCli } from '../cli/adapter.js';

export class PlanRunner {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async run(plan: ExecutionPlan): Promise<void> {
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
          ], { cwd: plan.cwd });
          break;
        case 'command':
          result = await runCli([
            'run-command',
            '--mode', plan.mode,
            '--json',
            '--',
            plan.command.cli,
            ...plan.command.args
          ], { cwd: plan.cwd });
          break;
        case 'workflowFile':
          result = await runCli([
            'run',
            '--mode', plan.mode,
            '--json',
            plan.file
          ], { cwd: plan.cwd });
          break;
      }

      this.outputChannel.appendLine(`[PlanRunner] Result: ${JSON.stringify(result, null, 2)}`);
      
      if (result && result.ok === false) {
        const error = result.error || { message: 'Unknown error' };
        const errorCode = (error as any).code || 'N/A';
        vscode.window.showErrorMessage(`Task Failed: ${error.message} (${errorCode})`);
      } else {
        vscode.window.showInformationMessage(`Task Completed: ${plan.label}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[PlanRunner] Error: ${msg}`);
      vscode.window.showErrorMessage(`Execution Error: ${msg}`);
    }
  }

  async preview(plan: ExecutionPlan): Promise<any> {
    this.outputChannel.appendLine(`\n[PlanRunner] Previewing Plan: ${plan.label}`);
    
    switch (plan.type) {
      case 'intent':
        return runCli([
          'run',
          '--dry-run',
          '--json',
          plan.intent
        ], { cwd: plan.cwd });
      case 'command':
        return runCli([
          'run-command',
          '--dry-run',
          '--json',
          '--',
          plan.command.cli,
          ...plan.command.args
        ], { cwd: plan.cwd });
      case 'workflowFile':
        return runCli([
          'run',
          '--dry-run',
          '--json',
          plan.file
        ], { cwd: plan.cwd });
    }
  }
}
