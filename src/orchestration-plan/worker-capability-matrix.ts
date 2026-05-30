/**
 * Worker Capability Matrix Builder
 *
 * This module builds the worker capability matrix from built-in agent descriptors.
 * It defines what each external Agent CLI can do and how VectaHub should govern them.
 */

import type {
  WorkerCapabilityMatrix,
  WorkerCapabilitySummary,
  WorkerCapabilitySupportLevel,
  WorkerNativeFeature,
  WorkerTaskType,
} from '../types/worker-capability.js';
import { getAgentRegistry } from '../agent-runtime/registry.js';

/**
 * Default native feature support matrix for built-in workers
 */
const DEFAULT_NATIVE_FEATURES: Record<string, Partial<Record<WorkerNativeFeature, WorkerCapabilitySupportLevel>>> = {
  codex: {
    json_output: 'supported',
    headless: 'supported',
    approval: 'supported',
    sandbox: 'supported',
    mcp: 'partial',
    subagent: 'unsupported',
    memory: 'unsupported',
    checkpoint: 'partial',
    resume: 'partial',
  },
  claude: {
    json_output: 'supported',
    headless: 'supported',
    approval: 'supported',
    sandbox: 'supported',
    mcp: 'supported',
    subagent: 'unsupported',
    memory: 'unsupported',
    checkpoint: 'partial',
    resume: 'partial',
  },
  gemini: {
    json_output: 'supported',
    headless: 'supported',
    approval: 'supported',
    sandbox: 'supported',
    mcp: 'partial',
    subagent: 'unsupported',
    memory: 'unsupported',
    checkpoint: 'partial',
    resume: 'partial',
  },
  aider: {
    json_output: 'partial',
    headless: 'supported',
    approval: 'supported',
    sandbox: 'supported',
    mcp: 'unsupported',
    subagent: 'unsupported',
    memory: 'unsupported',
    checkpoint: 'supported',
    resume: 'supported',
  },
};

/**
 * Default suitable tasks for built-in workers
 */
const DEFAULT_SUITABLE_TASKS: Record<string, WorkerTaskType[]> = {
  codex: ['codegen', 'refactor', 'review', 'test', 'debug', 'docs', 'semantic_test'],
  claude: ['codegen', 'refactor', 'review', 'test', 'debug', 'docs', 'semantic_test'],
  gemini: ['codegen', 'refactor', 'review', 'test', 'debug', 'docs', 'semantic_test'],
  aider: ['codegen', 'refactor', 'review', 'test', 'debug'],
};

/**
 * Default constraints for built-in workers
 */
const DEFAULT_CONSTRAINTS: Record<string, string[]> = {
  codex: ['Requires structured output for reliable parsing', 'High-risk operations require explicit confirmation'],
  claude: ['Requires structured output for reliable parsing', 'High-risk operations require explicit confirmation'],
  gemini: ['Requires structured output for reliable parsing', 'High-risk operations require explicit confirmation'],
  aider: ['Works best with git-based workflows', 'JSON output support is partial'],
};

/**
 * Default LLM summaries for built-in workers
 */
const DEFAULT_LLM_SUMMARIES: Record<string, string> = {
  codex: 'Codex is a coding agent suitable for code generation, refactoring, reviewing, testing, and debugging. It supports JSON output, headless mode, approval, and sandboxing.',
  claude: 'Claude is a coding agent suitable for code generation, refactoring, reviewing, testing, and debugging. It supports JSON output, headless mode, approval, sandboxing, and MCP.',
  gemini: 'Gemini is a coding agent suitable for code generation, refactoring, reviewing, testing, and debugging. It supports JSON output, headless mode, approval, and sandboxing.',
  aider: 'Aider is a git-based coding agent suitable for code generation, refactoring, reviewing, testing, and debugging. It has strong checkpoint and resume capabilities.',
};

/**
 * Build a worker capability summary for a single worker
 */
function buildWorkerSummary(workerId: string): WorkerCapabilitySummary {
  const normalizedId = workerId.toLowerCase();
  const registry = getAgentRegistry();
  const descriptor = registry.getAgentDescriptor(normalizedId);

  const nativeFeatures: Record<WorkerNativeFeature, WorkerCapabilitySupportLevel> = {
    json_output: 'unsupported',
    headless: 'unsupported',
    approval: 'unsupported',
    sandbox: 'unsupported',
    mcp: 'unsupported',
    subagent: 'unsupported',
    memory: 'unsupported',
    checkpoint: 'unsupported',
    resume: 'unsupported',
    ...(DEFAULT_NATIVE_FEATURES[normalizedId] || {}),
  };

  const suitableTasks = DEFAULT_SUITABLE_TASKS[normalizedId] || [];
  const constraints = DEFAULT_CONSTRAINTS[normalizedId] || ['Unknown worker capabilities'];
  const llmSummary = DEFAULT_LLM_SUMMARIES[normalizedId] || `Worker ${workerId} with unknown capabilities.`;

  // 默认 workers (codex, claude, gemini, aider) 即使没有 descriptor 也允许
  const isDefaultWorker = ['codex', 'claude', 'gemini', 'aider'].includes(normalizedId);
  
  return {
    id: normalizedId,
    displayName: descriptor?.displayName || workerId,
    suitableTasks,
    nativeFeatures,
    constraints,
    allowInExecutablePlans: !!descriptor || isDefaultWorker,
    llmSummary,
  };
}

/**
 * Build the complete worker capability matrix
 */
export function buildWorkerCapabilityMatrix(): WorkerCapabilityMatrix {
  const registry = getAgentRegistry();
  const descriptors = registry.getAllDescriptors();
  const workers: Record<string, WorkerCapabilitySummary> = {};

  // Add all registered workers
  for (const descriptor of descriptors) {
    const summary = buildWorkerSummary(descriptor.id);
    workers[summary.id] = summary;
  }

  // Ensure default workers are included even if not registered
  for (const workerId of Object.keys(DEFAULT_NATIVE_FEATURES)) {
    if (!workers[workerId]) {
      workers[workerId] = buildWorkerSummary(workerId);
    }
  }

  return {
    workers,
    updatedAt: Date.now(),
  };
}

/**
 * Get a worker capability summary by ID
 */
export function getWorkerCapability(workerId: string): WorkerCapabilitySummary {
  const matrix = buildWorkerCapabilityMatrix();
  return matrix.workers[workerId.toLowerCase()] || buildWorkerSummary(workerId);
}

/**
 * Check if a worker supports a specific native feature
 */
export function workerSupportsFeature(
  workerId: string,
  feature: WorkerNativeFeature
): WorkerCapabilitySupportLevel {
  const capability = getWorkerCapability(workerId);
  return capability.nativeFeatures[feature] || 'unsupported';
}

/**
 * Check if a worker is suitable for a specific task type
 */
export function workerIsSuitableForTask(workerId: string, taskType: WorkerTaskType): boolean {
  const capability = getWorkerCapability(workerId);
  return capability.suitableTasks.includes(taskType);
}

/**
 * Check if a worker should be allowed in executable plans
 */
export function workerAllowInExecutablePlans(workerId: string): boolean {
  const capability = getWorkerCapability(workerId);
  return capability.allowInExecutablePlans;
}
