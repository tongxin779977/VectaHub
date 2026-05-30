
import type {
  OrchestrationPlan, OrchestrationTask } from '../types/index.js';
import { validateOrchestrationPlan } from './validator.js';
import { validateCommandSurface } from './command-surface-validator.js';
import { applySafetyReviewToPlan } from './safety-reviewer.js';

export interface PlannerResult {
  kind: 'plan' | 'reply' | 'clarify' | 'blocked';
  plan?: OrchestrationPlan;
  message?: string;
  error?: string;
}

export interface PlannerOptions {
  cwd?: string;
  source?: 'run' | 'chat' | 'document' | 'manual';
}

export function createEmptyPlan(options: PlannerOptions = {}): OrchestrationPlan {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0',
    planId: `plan-${Date.now()}`,
    source: options.source || 'run',
    goal: '',
    status: 'draft',
    assumptions: [],
    tasks: [],
    safetyReview: {
      status: 'not_reviewed',
      maxRiskLevel: 'safe',
      findings: [],
    },
    requiredConfirmations: [],
    verification: {
      required: false,
      commands: [],
      semanticChecks: [],
      successCriteria: [],
    },
    metadata: {
      createdAt: now,
      cwd: options.cwd || process.cwd(),
      intentRecognitionMethod: 'llm',
      confidence: 0.5,
    },
  };
}

export async function planFromCapability(
  goal: string,
  tasks: OrchestrationTask[],
  options: PlannerOptions = {}
): Promise<PlannerResult> {
  const plan = createEmptyPlan(options);
  plan.goal = goal;
  plan.tasks = tasks;
  plan.metadata.matchedCapability = 'capability-route';
  plan.metadata.confidence = 0.9;
  plan.status = 'draft';

  // Validate command surface
  const commandIssues = validateCommandSurface(plan);
  if (commandIssues.length > 0) {
    return {
      kind: 'blocked',
      error: 'Invalid commands in plan',
    };
  }

  // Validate plan
  const validation = validateOrchestrationPlan(plan);
  if (!validation.valid) {
    return {
      kind: 'blocked',
      error: validation.errors.join(', '),
    };
  }

  // Apply safety review
  const reviewedPlan = applySafetyReviewToPlan(plan, {
    cwd: options.cwd,
    isDryRun: true,
  });

  return {
    kind: 'plan',
    plan: reviewedPlan,
  };
}

export function planToReply(
  message: string,
  _options: PlannerOptions = {}
): PlannerResult {
  return {
    kind: 'reply',
    message,
  };
}

export function planToClarify(
  message: string,
  _options: PlannerOptions = {}
): PlannerResult {
  return {
    kind: 'clarify',
    message,
  };
}

export function planToBlocked(
  message: string,
  _options: PlannerOptions = {}
): PlannerResult {
  return {
    kind: 'blocked',
    error: message,
  };
}

