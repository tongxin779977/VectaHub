
import type { DocTask, OrchestrationTask } from '../types/index.js';
import { planFromCapability, planToReply, type PlannerOptions, type PlannerResult } from './planner.js';

export interface DocTaskPlannerOptions extends PlannerOptions {
  docPath?: string;
  traceId?: string;
  auditEventIds?: string[];
}

export async function planFromDocTasks(
  docTasks: DocTask[],
  options: DocTaskPlannerOptions = {}
): Promise<PlannerResult> {
  if (docTasks.length === 0) {
    return planToReply('No tasks found in the document.');
  }

  const tasks: OrchestrationTask[] = [];
  let index = 0;

  while (index < docTasks.length) {
    const docTask = docTasks[index];
    const task: OrchestrationTask = {
      id: 'doc-task-' + (docTask.id || index),
      kind: 'apply',
      title: docTask.label,
      executor: 'agent',
      delegateTo: 'codex',
      dependsOn: [],
      inputs: [],
      outputs: [],
      sideEffect: 'write',
      confidence: 'medium',
      needsConfirmation: true,
    };

    if (options.docPath) {
      task.description = 'Task from ' + options.docPath + ': ' + docTask.label;
    } else {
      task.description = docTask.label;
    }

    if (index > 0) {
      const prevTask = docTasks[index - 1];
      task.dependsOn = ['doc-task-' + (prevTask.id || (index - 1))];
    }

    tasks.push(task);
    index++;
  }

  let goal;
  if (docTasks.length === 1) {
    goal = docTasks[0].label;
  } else {
    goal = 'Execute ' + docTasks.length + ' tasks from document';
    if (options.docPath) {
      goal += ' (' + options.docPath + ')';
    }
  }

  const result = await planFromCapability(goal, tasks, {
    cwd: options.cwd,
    source: 'document',
    traceId: options.traceId,
    auditEventIds: options.auditEventIds,
  });

  if (result.kind === 'plan' && result.plan && docTasks.length > 1) {
    result.plan.metadata.intentRecognitionMethod = 'document';
    result.plan.metadata.confidence = 0.85;
  }

  return result;
}

