/**
 * Native Feature Passthrough Policy
 *
 * This module implements the native feature passthrough policy, which governs
 * how VectaHub handles worker-native features like MCP, subagent, memory, etc.
 */

import type {
  NativeFeaturePolicy,
  NativeFeaturePassthroughPolicy,
  FeaturePassthroughRequest,
  FeaturePassthroughResult,
  FeaturePassthroughDecision,
} from '../types/native-feature-passthrough.js';
import type { WorkerNativeFeature } from '../types/worker-capability.js';
import { workerSupportsFeature } from './worker-capability-matrix.js';

/**
 * Default native feature policies
 */
const DEFAULT_FEATURE_POLICIES: Record<WorkerNativeFeature, Omit<NativeFeaturePolicy, 'feature'>> = {
  json_output: {
    defaultDecision: 'allow',
    allowInExecutablePlans: true,
    requiresAudit: false,
    description: 'Worker provides JSON output for structured responses',
    constraints: ['JSON output must still be validated by VectaHub schema'],
  },
  headless: {
    defaultDecision: 'allow',
    allowInExecutablePlans: true,
    requiresAudit: false,
    description: 'Worker can run without interactive UI',
    constraints: [],
  },
  approval: {
    defaultDecision: 'confirm',
    allowInExecutablePlans: true,
    requiresAudit: true,
    description: 'Worker has built-in approval flow',
    constraints: ['VectaHub safety review still applies regardless of worker approval'],
  },
  sandbox: {
    defaultDecision: 'allow',
    allowInExecutablePlans: true,
    requiresAudit: false,
    description: 'Worker has built-in sandboxing',
    constraints: ['VectaHub sandbox still applies regardless of worker sandbox'],
  },
  mcp: {
    defaultDecision: 'block',
    allowInExecutablePlans: false,
    requiresAudit: true,
    description: 'Worker supports MCP (Model Context Protocol)',
    constraints: ['MCP passthrough is currently disabled by default'],
  },
  subagent: {
    defaultDecision: 'block',
    allowInExecutablePlans: false,
    requiresAudit: true,
    description: 'Worker can spawn subagents',
    constraints: ['Subagent passthrough is currently disabled by default'],
  },
  memory: {
    defaultDecision: 'block',
    allowInExecutablePlans: false,
    requiresAudit: true,
    description: 'Worker has persistent memory',
    constraints: ['Memory passthrough is currently disabled by default'],
  },
  checkpoint: {
    defaultDecision: 'confirm',
    allowInExecutablePlans: true,
    requiresAudit: true,
    description: 'Worker supports checkpointing',
    constraints: ['Checkpoint references should be tracked by VectaHub'],
  },
  resume: {
    defaultDecision: 'confirm',
    allowInExecutablePlans: true,
    requiresAudit: true,
    description: 'Worker supports resuming from checkpoints',
    constraints: ['Resume operations must validate checkpoint hash and context'],
  },
};

/**
 * Build the default native feature passthrough policy
 */
export function buildNativeFeaturePassthroughPolicy(): NativeFeaturePassthroughPolicy {
  const policies: Record<WorkerNativeFeature, NativeFeaturePolicy> = {} as Record<
    WorkerNativeFeature,
    NativeFeaturePolicy
  >;

  for (const [feature, policy] of Object.entries(DEFAULT_FEATURE_POLICIES)) {
    policies[feature as WorkerNativeFeature] = {
      feature: feature as WorkerNativeFeature,
      ...policy,
    };
  }

  return {
    policies,
    updatedAt: Date.now(),
  };
}

/**
 * Get the policy for a specific native feature
 */
export function getNativeFeaturePolicy(feature: WorkerNativeFeature): NativeFeaturePolicy {
  const policy = buildNativeFeaturePassthroughPolicy().policies[feature];
  if (!policy) {
    return {
      feature,
      defaultDecision: 'block',
      allowInExecutablePlans: false,
      requiresAudit: true,
      description: `Unknown feature: ${feature}`,
      constraints: ['Unknown features are blocked by default'],
    };
  }
  return policy;
}

/**
 * Evaluate a feature passthrough request against the policy
 */
export function evaluateFeaturePassthroughRequest(request: FeaturePassthroughRequest): FeaturePassthroughResult {
  const policy = getNativeFeaturePolicy(request.feature);
  const workerSupport = workerSupportsFeature(request.workerId, request.feature);
  const workerSupports = workerSupport !== 'unsupported';

  let decision: FeaturePassthroughDecision;
  let reason: string;

  // First check if worker supports the feature
  if (!workerSupports) {
    decision = 'unsupported';
    reason = `Worker ${request.workerId} does not support feature ${request.feature}`;
  }
  // Then check if feature is allowed in executable plans (if applicable)
  else if (request.isExecutablePlan && !policy.allowInExecutablePlans) {
    decision = 'block';
    reason = `Feature ${request.feature} is not allowed in executable plans`;
  }
  // Otherwise use default policy decision
  else {
    decision = policy.defaultDecision;
    reason = `Feature ${request.feature} policy: ${policy.description}`;
  }

  return {
    policy,
    decision,
    workerSupportsFeature: workerSupports,
    reason,
    auditMetadata: policy.requiresAudit
      ? {
          workerId: request.workerId,
          feature: request.feature,
          isExecutablePlan: request.isExecutablePlan,
          timestamp: Date.now(),
        }
      : undefined,
  };
}

/**
 * Check if a feature passthrough is allowed
 */
export function isFeaturePassthroughAllowed(request: FeaturePassthroughRequest): boolean {
  const result = evaluateFeaturePassthroughRequest(request);
  return result.decision === 'allow';
}

/**
 * Check if a feature passthrough requires confirmation
 */
export function doesFeaturePassthroughRequireConfirmation(request: FeaturePassthroughRequest): boolean {
  const result = evaluateFeaturePassthroughRequest(request);
  return result.decision === 'confirm';
}

/**
 * Check if a feature passthrough is blocked
 */
export function isFeaturePassthroughBlocked(request: FeaturePassthroughRequest): boolean {
  const result = evaluateFeaturePassthroughRequest(request);
  return result.decision === 'block' || result.decision === 'unsupported';
}
