import { z } from 'zod';
import type {
  OrchestrationPlan,
  OrchestrationTask,
  ConfirmationRequest,
  CommandInvocation,
} from '../types/orchestration-plan.js';
import { validateCommandInvocation, validateCommandInvocations } from './command-surface-validator.js';

const CommandInvocationSchema = z.object({
  cli: z.string().min(1, 'cli cannot be empty'),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  envPolicy: z.enum(['inherit-safe', 'explicit-only']).optional(),
});

const PlanInputRefSchema = z.object({
  kind: z.enum(['text', 'file', 'artifact', 'previous_output']),
  ref: z.string(),
  required: z.boolean(),
});

const PlanOutputRefSchema = z.object({
  kind: z.enum(['text', 'file', 'artifact', 'stdout', 'report']),
  ref: z.string(),
  required: z.boolean(),
});

const OrchestrationTaskSchema = z.object({
  id: z.string().min(1, 'task id cannot be empty'),
  kind: z.enum(['reply', 'inspect', 'transform', 'apply', 'verify', 'recover']),
  title: z.string().min(1, 'task title cannot be empty'),
  description: z.string().optional(),
  executor: z.enum(['local', 'workflow', 'agent', 'human']),
  command: CommandInvocationSchema.optional(),
  delegateTo: z.enum(['codex', 'claude', 'gemini', 'aider', 'custom']).optional(),
  dependsOn: z.array(z.string()),
  inputs: z.array(PlanInputRefSchema),
  outputs: z.array(PlanOutputRefSchema),
  sideEffect: z.enum(['none', 'read', 'write', 'command', 'network']),
  confidence: z.enum(['low', 'medium', 'high']),
  needsConfirmation: z.boolean(),
  blockingReason: z.string().optional(),
});

const SafetyFindingSchema = z.object({
  taskId: z.string().optional(),
  level: z.enum(['safe', 'low', 'medium', 'high', 'critical']),
  category: z.enum(['filesystem', 'network', 'command', 'agent', 'data', 'unknown']),
  reason: z.string(),
  requiredAction: z.enum(['allow', 'confirm', 'block']),
});

const PlanSafetyReviewSchema = z.object({
  status: z.enum(['not_reviewed', 'safe', 'needs_confirmation', 'blocked']),
  maxRiskLevel: z.enum(['safe', 'low', 'medium', 'high', 'critical']),
  findings: z.array(SafetyFindingSchema),
  reviewedAt: z.string().optional(),
});

const ConfirmationRequestSchema = z.object({
  id: z.string().min(1, 'confirmation id cannot be empty'),
  taskIds: z.array(z.string()),
  reason: z.string(),
  prompt: z.string(),
  defaultAction: z.enum(['deny', 'allow']),
});

const SemanticCheckSchema = z.object({
  id: z.string().min(1, 'semantic check id cannot be empty'),
  description: z.string(),
  expectedMeaning: z.string(),
});

const VerificationPlanSchema = z.object({
  required: z.boolean(),
  commands: z.array(CommandInvocationSchema),
  semanticChecks: z.array(SemanticCheckSchema),
  successCriteria: z.array(z.string()),
});

const WorkflowDraftSummarySchema = z.object({
  draftId: z.string().min(1, 'draftId cannot be empty'),
  stepCount: z.number().int().min(0),
  hasSideEffects: z.boolean(),
  requiresConfirmation: z.boolean(),
});

const PlanTraceLinkSchema = z.object({
  traceId: z.string().optional(),
  auditEventIds: z.array(z.string()),
  executionId: z.string().optional(),
});

const OrchestrationPlanMetadataSchema = z.object({
  createdAt: z.string(),
  cwd: z.string(),
  intentRecognitionMethod: z.enum(['capability', 'llm', 'direct', 'document', 'manual']),
  matchedCapability: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const OrchestrationPlanSchema = z.object({
  schemaVersion: z.literal('1.0'),
  planId: z.string().min(1, 'planId cannot be empty'),
  source: z.enum(['run', 'chat', 'document', 'manual']),
  goal: z.string().min(1, 'goal cannot be empty'),
  status: z.enum(['draft', 'needs_confirmation', 'ready', 'blocked', 'executed']),
  assumptions: z.array(z.string()),
  tasks: z.array(OrchestrationTaskSchema),
  safetyReview: PlanSafetyReviewSchema,
  requiredConfirmations: z.array(ConfirmationRequestSchema),
  verification: VerificationPlanSchema,
  workflowDraft: WorkflowDraftSummarySchema.optional(),
  trace: PlanTraceLinkSchema.optional(),
  metadata: OrchestrationPlanMetadataSchema,
});

export interface PlanValidationError {
  code: string;
  message: string;
  path: string[];
}

export interface PlanValidationResult {
  valid: boolean;
  errors: PlanValidationError[];
  plan?: OrchestrationPlan;
}

function validateTaskIdUniqueness(tasks: OrchestrationTask[]): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    if (seen.has(task.id)) {
      errors.push({
        code: 'duplicate_task_id',
        message: `Task id "${task.id}" is not unique within the plan`,
        path: ['tasks', task.id],
      });
    }
    seen.add(task.id);
  }

  return errors;
}

function validateDependsOnReferences(tasks: OrchestrationTask[]): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  const taskIds = new Set(tasks.map(t => t.id));

  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        errors.push({
          code: 'invalid_dependency',
          message: `Task "${task.id}" depends on non-existent task "${depId}"`,
          path: ['tasks', task.id, 'dependsOn'],
        });
      }
    }
  }

  return errors;
}

function validateAgentExecutorDelegate(tasks: OrchestrationTask[], planStatus: string): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  for (const task of tasks) {
    if (task.executor === 'agent' && !task.delegateTo) {
      if (planStatus !== 'blocked' && !task.needsConfirmation) {
        errors.push({
          code: 'agent_missing_delegate',
          message: `Task "${task.id}" has executor "agent" but no delegateTo specified`,
          path: ['tasks', task.id, 'delegateTo'],
        });
      }
    }
  }

  return errors;
}

function validateReplyTaskNoCommand(tasks: OrchestrationTask[]): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  for (const task of tasks) {
    if (task.kind === 'reply' && task.command) {
      errors.push({
        code: 'reply_with_command',
        message: `Task "${task.id}" has kind "reply" but carries a command`,
        path: ['tasks', task.id, 'command'],
      });
    }
  }

  return errors;
}

function validateConfirmationTaskIds(confirmations: ConfirmationRequest[], tasks: OrchestrationTask[]): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  const taskIds = new Set(tasks.map(t => t.id));

  for (const confirmation of confirmations) {
    for (const taskId of confirmation.taskIds) {
      if (!taskIds.has(taskId)) {
        errors.push({
          code: 'confirmation_invalid_task',
          message: `Confirmation "${confirmation.id}" references non-existent task "${taskId}"`,
          path: ['requiredConfirmations', confirmation.id, 'taskIds'],
        });
      }
    }
  }

  return errors;
}

function validateTaskCommands(tasks: OrchestrationTask[]): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (task.command) {
      const result = validateCommandInvocation(task.command, ['tasks', String(i), 'command']);
      if (!result.valid) {
        errors.push(...result.errors as PlanValidationError[]);
      }
    }
  }

  return errors;
}

function validateVerificationCommands(verification: { commands: CommandInvocation[] }): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  const result = validateCommandInvocations(verification.commands, ['verification', 'commands']);
  if (!result.valid) {
    errors.push(...result.errors as PlanValidationError[]);
  }
  return errors;
}

export function validateOrchestrationPlan(input: unknown): PlanValidationResult {
  const schemaResult = OrchestrationPlanSchema.safeParse(input);

  if (!schemaResult.success) {
    const errors: PlanValidationError[] = schemaResult.error.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map(String),
    }));
    return { valid: false, errors };
  }

  const plan = schemaResult.data as OrchestrationPlan;
  const businessErrors: PlanValidationError[] = [
    ...validateTaskIdUniqueness(plan.tasks),
    ...validateDependsOnReferences(plan.tasks),
    ...validateAgentExecutorDelegate(plan.tasks, plan.status),
    ...validateReplyTaskNoCommand(plan.tasks),
    ...validateConfirmationTaskIds(plan.requiredConfirmations, plan.tasks),
    ...validateTaskCommands(plan.tasks),
    ...validateVerificationCommands(plan.verification),
  ];

  if (businessErrors.length > 0) {
    return { valid: false, errors: businessErrors };
  }

  return { valid: true, errors: [], plan };
}
