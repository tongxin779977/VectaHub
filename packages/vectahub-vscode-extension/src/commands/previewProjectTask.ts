import * as vscode from 'vscode';
import { ProjectTask } from '../project/taskModel.js';
import { PlanBuilder } from '../execution/planBuilder.js';
import { PlanRunner } from '../execution/planRunner.js';
import { getOutputChannel } from '../ui/output.js';

export async function previewProjectTask(task: ProjectTask) {
  const plan = PlanBuilder.createProjectTaskPlan(task);
  if (!plan) {
    return undefined;
  }
  const runner = new PlanRunner(getOutputChannel());
  const result = await runner.preview(plan);
  return { ok: result?.ok ?? false, intent: task.label, steps: [] };
}

export function registerPreviewProjectTaskCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.previewProjectTask', async (task: ProjectTask) => {
    await previewProjectTask(task);
  });
  context.subscriptions.push(disposable);
}