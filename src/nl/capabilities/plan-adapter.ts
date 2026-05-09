import type { ExecutionPlan, ExecutionPlanStep } from './types.js';
import type { Step, StepType } from '../../types/workflow.js';
import type { TaskList, Task, IntentName } from '../../types/nl.js';

const PLAN_STEP_TYPE_MAP: Record<ExecutionPlanStep['type'], StepType> = {
  'command': 'exec',
  'internal': 'exec',
  'workflow': 'exec',
};

function planStepToStep(planStep: ExecutionPlanStep): Step | null {
  if (planStep.type === 'internal') {
    return {
      id: planStep.id,
      type: 'exec',
      cli: 'echo',
      args: [`[internal] ${planStep.label}`],
    };
  }

  if (planStep.type === 'command' && planStep.command) {
    return {
      id: planStep.id,
      type: PLAN_STEP_TYPE_MAP[planStep.type],
      cli: planStep.command.cli,
      args: planStep.command.args,
    };
  }

  if (planStep.type === 'workflow' && planStep.workflowFile) {
    return {
      id: planStep.id,
      type: 'exec',
      cli: 'vectahub',
      args: ['run', '--file', planStep.workflowFile],
    };
  }

  return null;
}

export function executionPlanToSteps(plan: ExecutionPlan): Step[] {
  const steps: Step[] = [];
  for (const planStep of plan.steps) {
    const step = planStepToStep(planStep);
    if (step) {
      steps.push(step);
    }
  }
  return steps;
}

export function executionPlanToTaskList(plan: ExecutionPlan): TaskList {
  const steps = executionPlanToSteps(plan);

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    originalInput: plan.goal.evidence.githubActionUrls?.[0] || '',
    intent: 'GIT_WORKFLOW' as IntentName,
    confidence: plan.goal.confidence,
    entities: {
      FILE_PATH: [],
      CLI_TOOL: [],
      PACKAGE_NAME: [],
      FUNCTION_NAME: [],
      BRANCH_NAME: [],
      ENV: [],
      OPTIONS: [],
      HOST: [],
      PORT: [],
      OWNER: [],
      MODE: [],
      FILE1: [],
      FILE2: [],
    },
    tasks: [{
      id: plan.id,
      type: 'CODE_TRANSFORM',
      description: plan.label,
      status: 'PENDING' as const,
      commands: steps.map(s => ({
        cli: s.cli || 'echo',
        args: s.args || [],
      })),
      dependencies: [],
    }],
    warnings: [],
  };
}
