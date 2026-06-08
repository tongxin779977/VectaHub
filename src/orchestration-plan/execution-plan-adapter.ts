import type { ExecutionPlan, ExecutionPlanStep } from '../nl/capabilities/types.js';
import type {
  OrchestrationPlan,
  OrchestrationTask,
  CommandInvocation,
} from '../types/orchestration-plan.js';
import { validateOrchestrationPlan } from './validator.js';

function mapStepKind(step: ExecutionPlanStep): OrchestrationTask['kind'] {
  if (step.type === 'command') return 'apply';
  if (step.type === 'workflow') return 'apply';
  return 'reply';
}

function mapSideEffect(step: ExecutionPlanStep): OrchestrationTask['sideEffect'] {
  if (step.type === 'command' && step.command) return 'command';
  if (step.type === 'workflow') return 'write';
  return 'none';
}

function mapCommand(step: ExecutionPlanStep): CommandInvocation | undefined {
  if (!step.command) return undefined;
  return {
    cli: step.command.cli,
    args: step.command.args,
  };
}

function mapStepToTask(step: ExecutionPlanStep, index: number, allSteps: ExecutionPlanStep[]): OrchestrationTask {
  const taskId = step.id || `task-${index + 1}`;
  const dependsOn: string[] = [];
  if (index > 0) {
    const prevStep = allSteps[index - 1];
    dependsOn.push(prevStep.id || `task-${index}`);
  }
  return {
    id: taskId,
    kind: mapStepKind(step),
    title: step.label,
    executor: step.type === 'workflow' ? 'workflow' : 'local',
    command: mapCommand(step),
    dependsOn,
    inputs: [],
    outputs: step.outputVar
      ? [{ kind: 'text', ref: step.outputVar, required: true }]
      : [],
    sideEffect: mapSideEffect(step),
    confidence: 'medium',
    needsConfirmation: step.type === 'command' && !step.internalOutput,
  };
}

export interface ExecutionPlanConversionResult {
  plan: OrchestrationPlan;
  validation: {
    valid: boolean;
    errors: Array<{ code: string; message: string; path: string[] }>;
  };
}

export function executionPlanToOrchestrationPlan(
  executionPlan: ExecutionPlan,
  options?: { cwd?: string; source?: OrchestrationPlan['source'] },
): ExecutionPlanConversionResult {
  const tasks: OrchestrationTask[] = executionPlan.steps.map((step, index) => mapStepToTask(step, index, executionPlan.steps));

  const hasCommandTasks = tasks.some(t => t.sideEffect === 'command' || t.sideEffect === 'write');
  const needsConfirmation = tasks.some(t => t.needsConfirmation);

  const plan: OrchestrationPlan = {
    schemaVersion: '1.0',
    planId: executionPlan.id,
    source: options?.source || 'run',
    goal: typeof executionPlan.goal === 'string'
      ? executionPlan.goal
      : executionPlan.goal.action || executionPlan.label,
    status: needsConfirmation ? 'needs_confirmation' : 'draft',
    assumptions: [],
    tasks,
    safetyReview: {
      status: hasCommandTasks ? 'not_reviewed' : 'safe',
      maxRiskLevel: hasCommandTasks ? 'medium' : 'safe',
      findings: [],
    },
    requiredConfirmations: [],
    verification: {
      required: hasCommandTasks,
      commands: tasks
        .filter(t => t.command && t.kind === 'apply')
        .map(t => t.command!),
      semanticChecks: [],
      successCriteria: executionPlan.userReport.verificationSteps || [],
    },
    metadata: {
      createdAt: new Date().toISOString(),
      cwd: options?.cwd || process.cwd(),
      intentRecognitionMethod: 'capability',
      matchedCapability: executionPlan.capabilityId,
    },
  };

  const validation = validateOrchestrationPlan(plan);

  return {
    plan,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
    },
  };
}
