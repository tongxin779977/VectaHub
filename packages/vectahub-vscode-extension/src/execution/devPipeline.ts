import { ProjectTask, ProjectTaskKind } from '../project/taskModel.js';
import { ExecutionPlan } from './plan.js';
import { PlanBuilder } from './planBuilder.js';

export interface PipelineStep {
  kind: ProjectTaskKind;
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
  { kind: 'check', idPattern: 'format:check', label: '格式检查' },
  { kind: 'typecheck', label: '类型检查' },
  { kind: 'lint', label: '代码检查' },
  { kind: 'test', label: '运行测试' },
  { kind: 'build', label: '构建项目' }
];

function findTaskForStep(step: PipelineStep, tasks: ProjectTask[]): ProjectTask | undefined {
  return tasks.find(t => {
    if (t.kind !== step.kind) return false;
    if (step.idPattern && !t.id.includes(step.idPattern)) return false;
    return true;
  });
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
