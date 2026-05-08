import { ProjectTask } from '../project/taskModel.js';
import { getExecutionMode } from '../config/settings.js';
import { ExecutionPlan, getWorkspaceCwd } from './plan.js';

export function createIntentPlan(intent: string): ExecutionPlan {
  return {
    id: `intent-${Date.now()}`,
    type: 'intent',
    label: intent,
    source: 'intent',
    mode: getExecutionMode(),
    cwd: getWorkspaceCwd(),
    intent,
  };
}

export function createProjectTaskPlan(task: ProjectTask): ExecutionPlan | undefined {
  if (!task.command) return undefined;

  return {
    id: task.id,
    type: 'command',
    label: task.label,
    source: task.source,
    mode: getExecutionMode(),
    cwd: getWorkspaceCwd(),
    command: task.command,
  };
}

export function createWorkflowFilePlan(file: string): ExecutionPlan {
  return {
    id: `workflow-${Date.now()}`,
    type: 'workflowFile',
    label: file,
    source: 'workflow-file',
    mode: getExecutionMode(),
    cwd: getWorkspaceCwd(),
    file,
  };
}
