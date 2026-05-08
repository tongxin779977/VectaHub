import * as vscode from 'vscode';
import { ProjectTask } from '../project/taskModel.js';
import { createProjectTaskPlan } from '../execution/planBuilder.js';
import { previewPlan } from '../execution/planRunner.js';

export async function previewProjectTask(task: ProjectTask) {
  const plan = createProjectTaskPlan(task);
  if (!plan) {
    return undefined;
  }
  const ok = await previewPlan(plan);
  return { ok, intent: task.label, steps: [] };
}

export function registerPreviewProjectTaskCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.previewProjectTask', async (task: ProjectTask) => {
    await previewProjectTask(task);
  });
  context.subscriptions.push(disposable);
}