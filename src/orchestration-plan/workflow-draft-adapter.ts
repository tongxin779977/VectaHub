import type { WorkflowDraft, WorkflowDraftStep } from '../types/workflow-draft.js';
import type { Step } from '../types/workflow.js';
import { validateWorkflowDraft, type DraftValidationError } from './workflow-draft-validator.js';
import { hashObject } from './hash.js';

/**
 * Input for converting simple step data to WorkflowDraft.
 * Used by the dry-run path where we have basic CLI step info.
 */
export interface SimpleStepInput {
  cli: string;
  args: string[];
}

export interface StepsToDraftOptions {
  name?: string;
  mode?: 'strict' | 'relaxed' | 'consensus';
  cwd?: string;
  source?: 'run' | 'chat' | 'document' | 'manual';
}

export interface StepsToDraftResult {
  draft: WorkflowDraft;
  validation: {
    valid: boolean;
    errors: DraftValidationError[];
  };
}

/**
 * Convert simple step data (from dry-run path) to a WorkflowDraft.
 * This is the runtime boundary adapter for the `run --dry-run --json` output,
 * analogous to `executionPlanToOrchestrationPlan` for the plan path.
 */
export function stepsToWorkflowDraft(
  steps: SimpleStepInput[],
  options: StepsToDraftOptions = {},
): StepsToDraftResult {
  const now = new Date().toISOString();
  const mode = options.mode || 'strict';
  const cwd = options.cwd || process.cwd();
  const source = options.source || 'run';
  const name = options.name || 'nl-generated';

  const draftSteps: WorkflowDraftStep[] = steps.map((step, index) => ({
    id: `step-${index + 1}`,
    sourceTaskId: `task-${index + 1}`,
    type: 'exec' as const,
    label: `${step.cli} ${step.args.join(' ')}`.trim(),
    dependsOn: index > 0 ? [`step-${index}`] : [],
    command: {
      cli: step.cli,
      args: step.args,
    },
    sideEffect: 'command' as const,
  }));

  const workflowStructure = {
    steps: draftSteps.map(s => ({
      id: s.id,
      type: s.type,
      label: s.label,
      dependsOn: s.dependsOn,
      command: s.command,
    })),
  };

  const draft: WorkflowDraft = {
    schemaVersion: '1.0',
    draftId: `draft-${Date.now()}`,
    planId: `plan-dryrun-${Date.now()}`,
    status: 'draft',
    name,
    mode,
    steps: draftSteps,
    safetyReview: {
      status: 'not_reviewed',
      findings: [],
    },
    snapshot: {
      planHash: hashObject({ source: 'dry-run', steps: workflowStructure }),
      workflowHash: hashObject(workflowStructure),
      generatedAt: now,
      sourceCwd: cwd,
    },
    verification: {
      required: false,
      commands: [],
      successCriteria: [],
    },
    metadata: {
      createdAt: now,
      createdFrom: source,
      cwd,
      dryRunAvailable: true,
      persistRequested: false,
    },
  };

  const validation = validateWorkflowDraft(draft);

  return {
    draft,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
    },
  };
}

/**
 * Convert a loaded Workflow (from file) to a WorkflowDraft.
 * Used by the `run --dry-run --json --file` path.
 */
export function workflowToDraft(
  workflow: { name: string; steps: Step[] },
  options: StepsToDraftOptions = {},
): StepsToDraftResult {
  const simpleSteps: SimpleStepInput[] = workflow.steps.map(step => ({
    cli: step.cli || step.type || '',
    args: step.args ?? [],
  }));

  return stepsToWorkflowDraft(simpleSteps, {
    ...options,
    name: workflow.name,
  });
}
