/**
 * Worker Capability Matrix Types
 *
 * This module defines the types for worker capability matrix, which records
 * what each external Agent CLI can do, what native features they support,
 * and how VectaHub should govern them.
 */

export type WorkerCapabilitySupportLevel = 'supported' | 'partial' | 'unsupported';

export type WorkerNativeFeature =
  | 'json_output'
  | 'headless'
  | 'approval'
  | 'sandbox'
  | 'mcp'
  | 'subagent'
  | 'memory'
  | 'checkpoint'
  | 'resume';

export type WorkerTaskType =
  | 'codegen'
  | 'refactor'
  | 'review'
  | 'test'
  | 'debug'
  | 'docs'
  | 'shell'
  | 'semantic_test';

export interface WorkerCapabilitySummary {
  /** Worker ID (e.g., 'codex', 'claude', 'gemini', 'aider') */
  id: string;

  /** Human-readable display name */
  displayName: string;

  /** What task types this worker is suitable for */
  suitableTasks: WorkerTaskType[];

  /** Native feature support levels */
  nativeFeatures: Record<WorkerNativeFeature, WorkerCapabilitySupportLevel>;

  /** Constraints that must be respected when using this worker */
  constraints: string[];

  /** Whether this worker should be considered for executable plans */
  allowInExecutablePlans: boolean;

  /** LLM-readable summary for context packs */
  llmSummary: string;
}

export interface WorkerCapabilityMatrix {
  /** Map of worker ID to capability summary */
  workers: Record<string, WorkerCapabilitySummary>;

  /** Last updated timestamp */
  updatedAt: number;
}
