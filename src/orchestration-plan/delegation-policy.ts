/**
 * Delegation Policy
 *
 * This module defines the policy for delegating tasks to workers (external Agent CLIs).
 * It decides which worker is suitable for a task, checks worker readiness,
 * and defines verification requirements for delegated tasks.
 */

import type {
  OrchestrationTask,
  OrchestrationTaskKind,
  SideEffectLevel,
} from '../types/orchestration-plan.js';
import type {
  WorkerCapabilityMatrix,
  WorkerCapabilitySummary,
  WorkerTaskType,
} from '../types/worker-capability.js';
import {
  buildWorkerCapabilityMatrix,
  getWorkerCapability,
  workerIsSuitableForTask,
} from './worker-capability-matrix.js';

/**
 * Task kind to worker task type mapping
 */
const TASK_KIND_TO_WORKER_TYPE: Record<OrchestrationTaskKind, WorkerTaskType[]> = {
  reply: [],
  inspect: ['shell', 'semantic_test'],
  transform: ['codegen', 'refactor', 'docs'],
  apply: ['codegen', 'refactor', 'review', 'test', 'debug'],
  verify: ['test', 'semantic_test'],
  recover: ['debug', 'shell'],
};

/**
 * Side effect level to verification requirement mapping
 */
const SIDE_EFFECT_TO_VERIFICATION_REQUIRED: Record<SideEffectLevel, boolean> = {
  none: false,
  read: false,
  write: true,
  command: true,
  network: true,
};

/**
 * Delegation decision result
 */
export interface DelegationDecision {
  /** Whether the task can be delegated */
  canDelegate: boolean;

  /** Recommended worker ID (if canDelegate is true) */
  recommendedWorker?: string;

  /** List of suitable workers */
  suitableWorkers: string[];

  /** Whether verification is required for this delegated task */
  requiresVerification: boolean;

  /** Reason if cannot delegate */
  blockingReason?: string;
}

/**
 * Delegation policy options
 */
export interface DelegationPolicyOptions {
  /** Prefer specific worker */
  preferredWorker?: string;

  /** Allow partial support workers */
  allowPartialSupport?: boolean;
}

/**
 * Map an orchestration task kind to worker task types
 */
function mapTaskKindToWorkerTypes(taskKind: OrchestrationTaskKind): WorkerTaskType[] {
  return TASK_KIND_TO_WORKER_TYPE[taskKind] || [];
}

/**
 * Score a worker for a task (higher is better)
 */
function scoreWorkerForTask(
  worker: WorkerCapabilitySummary,
  task: OrchestrationTask,
  options: DelegationPolicyOptions
): number {
  let score = 0;

  // Check if worker is allowed in executable plans
  if (!worker.allowInExecutablePlans) {
    return -1;
  }

  // Check suitable tasks
  const workerTypes = mapTaskKindToWorkerTypes(task.kind);
  const hasMatchingType = workerTypes.some(type => worker.suitableTasks.includes(type));
  if (!hasMatchingType) {
    return -1;
  }

  // Add score for matching suitable tasks
  score += workerTypes.filter(type => worker.suitableTasks.includes(type)).length * 10;

  // Prefer workers with JSON output support
  if (worker.nativeFeatures.json_output === 'supported') {
    score += 20;
  } else if (worker.nativeFeatures.json_output === 'partial' && options.allowPartialSupport) {
    score += 5;
  }

  // Prefer workers with headless support
  if (worker.nativeFeatures.headless === 'supported') {
    score += 15;
  }

  // Prefer workers with sandbox support for high-risk tasks
  if (['write', 'command', 'network'].includes(task.sideEffect)) {
    if (worker.nativeFeatures.sandbox === 'supported') {
      score += 25;
    }
  }

  // Prefer preferred worker
  if (options.preferredWorker && worker.id === options.preferredWorker) {
    score += 50;
  }

  return score;
}

/**
 * Get suitable workers for a task
 */
function getSuitableWorkers(
  task: OrchestrationTask,
  matrix: WorkerCapabilityMatrix,
  options: DelegationPolicyOptions
): string[] {
  const workerScores: Array<{ id: string; score: number }> = [];

  for (const [workerId, worker] of Object.entries(matrix.workers)) {
    const score = scoreWorkerForTask(worker, task, options);
    if (score >= 0) {
      workerScores.push({ id: workerId, score });
    }
  }

  // Sort by score descending
  workerScores.sort((a, b) => b.score - a.score);

  return workerScores.map(w => w.id);
}

/**
 * Check if a worker is ready for delegation
 */
function isWorkerReady(workerId: string): boolean {
  const worker = getWorkerCapability(workerId);
  return worker.allowInExecutablePlans;
}

/**
 * Make a delegation decision for a task
 */
export function makeDelegationDecision(
  task: OrchestrationTask,
  options: DelegationPolicyOptions = {}
): DelegationDecision {
  const matrix = buildWorkerCapabilityMatrix();

  // Check if task should be delegated
  if (task.executor !== 'agent') {
    return {
      canDelegate: false,
      suitableWorkers: [],
      requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
      blockingReason: 'Task executor is not set to agent',
    };
  }

  // Check if delegateTo is already specified
  if (task.delegateTo) {
    const worker = getWorkerCapability(task.delegateTo);
    if (!worker.allowInExecutablePlans) {
      return {
        canDelegate: false,
        suitableWorkers: [],
        requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
        blockingReason: `Worker ${task.delegateTo} is not allowed in executable plans`,
      };
    }

    if (!isWorkerReady(task.delegateTo)) {
      return {
        canDelegate: false,
        suitableWorkers: [],
        requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
        blockingReason: `Worker ${task.delegateTo} is not ready`,
      };
    }

    // Check if worker is suitable for this task type
    const workerTypes = mapTaskKindToWorkerTypes(task.kind);
    const isSuitable = workerTypes.length === 0 || workerTypes.some(type =>
      workerIsSuitableForTask(task.delegateTo as string, type)
    );

    if (!isSuitable) {
      return {
        canDelegate: false,
        suitableWorkers: getSuitableWorkers(task, matrix, options),
        requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
        blockingReason: `Worker ${task.delegateTo} is not suitable for task type ${task.kind}`,
      };
    }

    return {
      canDelegate: true,
      recommendedWorker: task.delegateTo,
      suitableWorkers: [task.delegateTo],
      requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
    };
  }

  // Find suitable workers
  const suitableWorkers = getSuitableWorkers(task, matrix, options);

  if (suitableWorkers.length === 0) {
    return {
      canDelegate: false,
      suitableWorkers: [],
      requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
      blockingReason: 'No suitable workers found for this task',
    };
  }

  return {
    canDelegate: true,
    recommendedWorker: suitableWorkers[0],
    suitableWorkers,
    requiresVerification: SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect],
  };
}

/**
 * Apply delegation decision to a task
 */
export function applyDelegationDecision(
  task: OrchestrationTask,
  decision: DelegationDecision
): OrchestrationTask {
  if (!decision.canDelegate) {
    return {
      ...task,
      blockingReason: decision.blockingReason,
      needsConfirmation: true,
    };
  }

  return {
    ...task,
    delegateTo: decision.recommendedWorker as 'codex' | 'claude' | 'gemini' | 'aider' | 'custom',
    needsConfirmation: task.needsConfirmation || decision.requiresVerification,
  };
}

/**
 * Check if a task requires verification when delegated
 */
export function delegatedTaskRequiresVerification(task: OrchestrationTask): boolean {
  return SIDE_EFFECT_TO_VERIFICATION_REQUIRED[task.sideEffect];
}
