import { ProjectTask, ProjectTaskKind } from '../project/taskModel.js';
import { ExecutionPlan } from './plan.js';
import { PlanBuilder } from './planBuilder.js';

export interface PipelineStep {
  kinds: ProjectTaskKind[];
  idPattern?: string;
  label: string;
}

export interface PipelineResult {
  plans: ExecutionPlan[];
  included: ProjectTask[];
  skipped: string[];
}

export interface PipelineSelection {
  included: ProjectTask[];
  skipped: string[];
}

export const VERIFY_PIPELINE_STEPS: PipelineStep[] = [
  { kinds: ['format'], idPattern: 'format:check', label: '格式检查' },
  { kinds: ['typecheck'], label: '类型检查' },
  { kinds: ['lint', 'check', 'validate'], label: '代码检查' },
  { kinds: ['test', 'check', 'validate'], label: '运行测试' },
  { kinds: ['build', 'check', 'validate'], label: '构建项目' }
];

function findTaskForStep(step: PipelineStep, tasks: ProjectTask[]): ProjectTask | undefined {
  for (const kind of step.kinds) {
    const task = tasks.find(t => {
      if (t.kind !== kind) return false;
      if (step.idPattern && !t.id.includes(step.idPattern)) return false;
      return true;
    });
    if (task) return task;
  }
  return undefined;
}

export function selectPipelineTasks(steps: PipelineStep[], availableTasks: ProjectTask[]): PipelineSelection {
  const included: ProjectTask[] = [];
  const skipped: string[] = [];

  for (const step of steps) {
    const task = findTaskForStep(step, availableTasks);
    if (task) {
      included.push(task);
    } else {
      skipped.push(step.label);
    }
  }

  return { included, skipped };
}

export function createPipeline(
  steps: PipelineStep[],
  availableTasks: ProjectTask[]
): PipelineResult {
  const { included, skipped } = selectPipelineTasks(steps, availableTasks);

  if (included.length === 0) {
    return { plans: [], included, skipped };
  }

  const plans: ExecutionPlan[] = [];
  for (const task of included) {
    const plan = PlanBuilder.createProjectTaskPlan(task);
    if (plan) {
      plans.push(plan);
    }
  }

  return { plans, included, skipped };
}

export function createVerifyPipeline(availableTasks: ProjectTask[]): PipelineResult {
  return createPipeline(VERIFY_PIPELINE_STEPS, availableTasks);
}
