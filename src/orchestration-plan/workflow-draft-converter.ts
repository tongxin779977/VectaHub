import type {
  OrchestrationPlan,
  OrchestrationTask,
} from '../types/orchestration-plan.js';
import type {
  WorkflowDraft,
  WorkflowDraftStep,
  DraftSafetyReview,
  DraftVerification,
} from '../types/workflow-draft.js';
import { validateWorkflowDraft, type DraftValidationError } from './workflow-draft-validator.js';
import { createHash } from 'crypto';

function hashObject(obj: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 16);
}

function convertSafetyReview(
  plan: OrchestrationPlan
): DraftSafetyReview {
  return {
    status: plan.safetyReview.status,
    findings: plan.safetyReview.findings.map((finding) => {
      return {
        stepId: finding.taskId,
        level: finding.level,
        category: finding.category,
        reason: finding.reason,
        requiredAction: finding.requiredAction,
      };
    }),
  };
}

function convertVerification(
  plan: OrchestrationPlan
): DraftVerification {
  return {
    required: plan.verification.required,
    commands: plan.verification.commands,
    successCriteria: plan.verification.successCriteria,
  };
}

function convertTaskToStep(task: OrchestrationTask): WorkflowDraftStep | null {
  if (task.kind === 'reply') {
    return null;
  }

  let stepType: WorkflowDraftStep['type'] = 'exec';
  if (task.executor === 'agent' && task.delegateTo) {
    stepType = 'delegate';
  }

  const step: WorkflowDraftStep = {
    id: task.id,
    sourceTaskId: task.id,
    type: stepType,
    label: task.title,
    dependsOn: task.dependsOn,
    sideEffect: task.sideEffect,
  };

  if (task.command) {
    step.command = task.command;
  }

  if (task.delegateTo) {
    step.delegate = {
      to: task.delegateTo,
      prompt: task.description || '',
    };
  }

  return step;
}

export interface ConvertPlanToDraftOptions {
  cwd?: string;
  dryRun?: boolean;
}

export function convertPlanToDraft(
  plan: OrchestrationPlan,
  options: ConvertPlanToDraftOptions = {}
): WorkflowDraft {
  const now = new Date().toISOString();
  const planHash = hashObject(plan);
  const steps = plan.tasks
    .map(convertTaskToStep)
    .filter((step): step is WorkflowDraftStep => step !== null);

  const workflowStructure = {
    steps: steps.map((s) => {
      return {
        id: s.id,
        type: s.type,
        label: s.label,
        dependsOn: s.dependsOn,
        command: s.command,
        delegate: s.delegate,
      };
    }),
  };
  const workflowHash = hashObject(workflowStructure);

  const draft: WorkflowDraft = {
    schemaVersion: '1.0',
    draftId: `draft-${Date.now()}`,
    planId: plan.planId,
    status: 'draft',
    name: plan.goal.slice(0, 100),
    mode: 'strict',
    steps,
    safetyReview: convertSafetyReview(plan),
    snapshot: {
      planHash,
      workflowHash,
      generatedAt: now,
      sourceCwd: options.cwd || process.cwd(),
    },
    verification: convertVerification(plan),
    metadata: {
      createdAt: now,
      createdFrom: plan.source,
      cwd: options.cwd || process.cwd(),
      dryRunAvailable: true,
      persistRequested: false,
    },
  };

  if (draft.safetyReview.status === 'needs_confirmation') {
    draft.status = 'needs_confirmation';
  } else if (draft.safetyReview.status === 'safe') {
    draft.status = 'confirmed';
  }

  return draft;
}

export function convertAndValidatePlanToDraft(
  plan: OrchestrationPlan,
  options: ConvertPlanToDraftOptions = {}
): { valid: true; draft: WorkflowDraft } | { valid: false; errors: DraftValidationError[] } {
  const draft = convertPlanToDraft(plan, options);
  const validation = validateWorkflowDraft(draft);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
    };
  }

  return {
    valid: true,
    draft,
  };
}
