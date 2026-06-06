/**
 * Native Feature Passthrough Policy Types
 *
 * This module defines the types for native feature passthrough policy, which governs
 * how VectaHub handles worker-native features like MCP, subagent, memory, etc.
 */

import type { WorkerNativeFeature } from './worker-capability.js';

/**
 * Policy decision for a native feature passthrough request
 */
export type FeaturePassthroughDecision =
  | 'allow'
  | 'confirm'
  | 'block'
  | 'unsupported';

/**
 * Policy for a specific native feature
 */
export interface NativeFeaturePolicy {
  /** The native feature this policy applies to */
  feature: WorkerNativeFeature;

  /** Default decision for this feature */
  defaultDecision: FeaturePassthroughDecision;

  /** Whether this feature can be used in executable plans */
  allowInExecutablePlans: boolean;

  /** Whether this feature should be audited */
  requiresAudit: boolean;

  /** Human-readable description of the policy */
  description: string;

  /** Constraints that apply when this feature is used */
  constraints: string[];
}

/**
 * Complete native feature passthrough policy configuration
 */
export interface NativeFeaturePassthroughPolicy {
  /** Map of feature name to its policy */
  policies: Record<WorkerNativeFeature, NativeFeaturePolicy>;

  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Request to use a worker-native feature
 */
export interface FeaturePassthroughRequest {
  /** Worker ID */
  workerId: string;

  /** Feature being requested */
  feature: WorkerNativeFeature;

  /** Context about the request (for audit) */
  context: Record<string, unknown>;

  /** Whether this is part of an executable plan */
  isExecutablePlan: boolean;
}

/**
 * Result of a feature passthrough policy check
 */
export interface FeaturePassthroughResult {
  /** The policy that was applied */
  policy: NativeFeaturePolicy;

  /** The decision made */
  decision: FeaturePassthroughDecision;

  /** Whether the feature is supported by the worker */
  workerSupportsFeature: boolean;

  /** Human-readable reason for the decision */
  reason: string;

  /** Audit metadata to record */
  auditMetadata?: Record<string, unknown>;
}
