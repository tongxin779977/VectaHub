import { z } from 'zod';
import type {
  WorkflowDraft,
  WorkflowDraftStep,
} from '../types/workflow-draft.js';

const CommandInvocationSchema = z.object({
  cli: z.string().min(1, 'cli cannot be empty'),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  envPolicy: z.enum(['inherit-safe', 'explicit-only']).optional(),
});

const DraftSafetyFindingSchema = z.object({
  stepId: z.string().optional(),
  level: z.enum(['safe', 'low', 'medium', 'high', 'critical']),
  category: z.enum(['filesystem', 'network', 'command', 'agent', 'data', 'unknown']),
  reason: z.string(),
  requiredAction: z.enum(['allow', 'confirm', 'block']),
});

const DraftSafetyReviewSchema = z.object({
  status: z.enum(['not_reviewed', 'safe', 'needs_confirmation', 'blocked']),
  findings: z.array(DraftSafetyFindingSchema),
});

const DraftConfirmationSchema = z.object({
  confirmedAt: z.string(),
  confirmedBy: z.enum(['user', 'non_interactive_policy']),
  confirmedTaskIds: z.array(z.string()),
  deniedTaskIds: z.array(z.string()),
});

const WorkflowDraftSnapshotSchema = z.object({
  planHash: z.string().min(1, 'planHash cannot be empty'),
  workflowHash: z.string().min(1, 'workflowHash cannot be empty'),
  generatedAt: z.string(),
  sourceCwd: z.string(),
});

const DraftVerificationSchema = z.object({
  required: z.boolean(),
  commands: z.array(CommandInvocationSchema),
  successCriteria: z.array(z.string()),
});

const WorkflowDraftTraceLinkSchema = z.object({
  traceId: z.string().optional(),
  planId: z.string().min(1, 'planId cannot be empty'),
  executionId: z.string().optional(),
  auditEventIds: z.array(z.string()),
});

const WorkflowDraftMetadataSchema = z.object({
  createdAt: z.string(),
  createdFrom: z.enum(['run', 'chat', 'document', 'manual']),
  cwd: z.string(),
  dryRunAvailable: z.boolean(),
  persistRequested: z.boolean(),
});

const WorkflowDraftStepSchema = z.object({
  id: z.string().min(1, 'step id cannot be empty'),
  sourceTaskId: z.string().min(1, 'sourceTaskId cannot be empty'),
  type: z.enum(['exec', 'if', 'for_each', 'parallel', 'opencli', 'delegate']),
  label: z.string().min(1, 'step label cannot be empty'),
  dependsOn: z.array(z.string()),
  command: CommandInvocationSchema.optional(),
  delegate: z.object({
    to: z.enum(['codex', 'claude', 'gemini', 'aider', 'custom']),
    prompt: z.string(),
  }).optional(),
  outputVar: z.string().optional(),
  artifactOutputs: z.array(z.string()).optional(),
  sideEffect: z.enum(['none', 'read', 'write', 'command', 'network']),
});

export const WorkflowDraftSchema = z.object({
  schemaVersion: z.literal('1.0'),
  draftId: z.string().min(1, 'draftId cannot be empty'),
  planId: z.string().min(1, 'planId cannot be empty'),
  status: z.enum([
    'draft',
    'reviewed',
    'needs_confirmation',
    'confirmed',
    'persisted',
    'executing',
    'completed',
    'failed',
    'cancelled',
    'recoverable',
    'archived',
  ]),
  name: z.string().min(1, 'name cannot be empty'),
  mode: z.enum(['strict', 'relaxed', 'consensus']),
  steps: z.array(WorkflowDraftStepSchema),
  safetyReview: DraftSafetyReviewSchema,
  confirmation: DraftConfirmationSchema.optional(),
  snapshot: WorkflowDraftSnapshotSchema,
  verification: DraftVerificationSchema,
  trace: WorkflowDraftTraceLinkSchema.optional(),
  metadata: WorkflowDraftMetadataSchema,
});

export interface DraftValidationError {
  code: string;
  message: string;
  path: string[];
}

export interface DraftValidationResult {
  valid: boolean;
  errors: DraftValidationError[];
  draft?: WorkflowDraft;
}

function validateStepIdUniqueness(steps: WorkflowDraftStep[]): DraftValidationError[] {
  const errors: DraftValidationError[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    if (seen.has(step.id)) {
      errors.push({
        code: 'duplicate_step_id',
        message: `Step id "${step.id}" is not unique within the draft`,
        path: ['steps', step.id],
      });
    }
    seen.add(step.id);
  }

  return errors;
}

function validateStepDependsOnReferences(steps: WorkflowDraftStep[]): DraftValidationError[] {
  const errors: DraftValidationError[] = [];
  const stepIds = new Set(steps.map(s => s.id));

  for (const step of steps) {
    for (const depId of step.dependsOn) {
      if (!stepIds.has(depId)) {
        errors.push({
          code: 'invalid_step_dependency',
          message: `Step "${step.id}" depends on non-existent step "${depId}"`,
          path: ['steps', step.id, 'dependsOn'],
        });
      }
    }
  }

  return errors;
}

function validateStepTypeRequirements(steps: WorkflowDraftStep[]): DraftValidationError[] {
  const errors: DraftValidationError[] = [];

  for (const step of steps) {
    if (step.type === 'exec' && !step.command) {
      errors.push({
        code: 'exec_step_missing_command',
        message: `Step "${step.id}" has type "exec" but no command specified`,
        path: ['steps', step.id, 'command'],
      });
    }
    if (step.type === 'delegate' && !step.delegate) {
      errors.push({
        code: 'delegate_step_missing_delegate',
        message: `Step "${step.id}" has type "delegate" but no delegate specified`,
        path: ['steps', step.id, 'delegate'],
      });
    }
  }

  return errors;
}

function validateSafetyReviewForExecutableStatus(
  status: string,
  safetyReviewStatus: string,
  confirmation: unknown
): DraftValidationError[] {
  const errors: DraftValidationError[] = [];

  const executableStatuses = ['confirmed', 'persisted', 'executing'];
  if (executableStatuses.includes(status)) {
    if (safetyReviewStatus === 'blocked') {
      errors.push({
        code: 'unsafe_draft_cannot_execute',
        message: 'Draft cannot be in executable status when safety review is blocked',
        path: ['status'],
      });
    }
    if (safetyReviewStatus === 'needs_confirmation' && !confirmation) {
      errors.push({
        code: 'needs_confirmation_without_confirmation',
        message: 'Draft needs confirmation but no confirmation record exists',
        path: ['confirmation'],
      });
    }
  }

  return errors;
}

export function validateWorkflowDraft(input: unknown): DraftValidationResult {
  const schemaResult = WorkflowDraftSchema.safeParse(input);

  if (!schemaResult.success) {
    const errors: DraftValidationError[] = schemaResult.error.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map(String),
    }));
    return { valid: false, errors };
  }

  const draft = schemaResult.data as WorkflowDraft;
  const businessErrors: DraftValidationError[] = [
    ...validateStepIdUniqueness(draft.steps),
    ...validateStepDependsOnReferences(draft.steps),
    ...validateStepTypeRequirements(draft.steps),
    ...validateSafetyReviewForExecutableStatus(
      draft.status,
      draft.safetyReview.status,
      draft.confirmation
    ),
  ];

  if (businessErrors.length > 0) {
    return { valid: false, errors: businessErrors };
  }

  return { valid: true, errors: [], draft };
}
