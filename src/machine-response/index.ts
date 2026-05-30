import type {
  MachineResponseEnvelope,
  MachineResponseResult,
  MachineResponseSuccess,
  MachineResponseReply,
  MachineResponseClarify,
  MachineResponseBlocked,
  MachineResponseValidationError,
  MachineResponseSafetyError,
  MachineResponseInternalError,
  MachineResponsePlan,
  MachineResponseWorkflowDraft,
} from '../types/machine-response.js';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';
import { formatHumanReadable } from './human-readable-formatter.js';

/**
 * Safe error serializer - prevents secrets, stack traces, and sensitive data from appearing in machine responses
 */
export function safeErrorSerialize(error: unknown): {
  reason: string;
  errorId?: string;
} {
  let reason = 'An unexpected error occurred';
  let errorId: string | undefined;

  if (error instanceof Error) {
    reason = error.message || reason;
    // Generate a unique error ID for tracking without exposing stack traces
    errorId = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  } else if (typeof error === 'string') {
    reason = error;
  }

  // Never expose sensitive data - always return a safe, redacted message
  return {
    reason,
    errorId,
  };
}

/**
 * Build machine response envelope with standardized structure
 */
export function buildMachineResponse(
  result: MachineResponseResult,
  options?: { requestId?: string; intent?: string; reply?: string },
): MachineResponseEnvelope {
  const ok =
    result.kind === 'success' ||
    result.kind === 'reply' ||
    result.kind === 'clarify' ||
    result.kind === 'plan' ||
    result.kind === 'workflow_draft';

  return {
    schemaVersion: '1.0',
    ok,
    result,
    requestId: options?.requestId,
    intent: options?.intent,
    reply: options?.reply,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build success response
 */
export function buildSuccessResponse(
  message: string,
  options?: { requestId?: string; intent?: string },
): MachineResponseEnvelope {
  const result: MachineResponseSuccess = {
    kind: 'success',
    message,
  };
  return buildMachineResponse(result, { ...options, reply: message });
}

/**
 * Build reply response
 */
export function buildReplyResponse(
  reply: string,
  options?: { requestId?: string; intent?: string },
): MachineResponseEnvelope {
  const result: MachineResponseReply = {
    kind: 'reply',
    reply,
  };
  return buildMachineResponse(result, { ...options, reply });
}

/**
 * Build clarify response
 */
export function buildClarifyResponse(
  reason: string,
  options?: { requestId?: string; intent?: string; suggestedAction?: string },
): MachineResponseEnvelope {
  const result: MachineResponseClarify = {
    kind: 'clarify',
    reason,
    suggestedAction: options?.suggestedAction,
  };
  return buildMachineResponse(result, { ...options, reply: reason });
}

/**
 * Build blocked response
 */
export function buildBlockedResponse(
  reason: string,
  options?: {
    requestId?: string;
    intent?: string;
    blockedBy?: MachineResponseBlocked['blockedBy'];
    suggestedAction?: string;
  },
): MachineResponseEnvelope {
  const result: MachineResponseBlocked = {
    kind: 'blocked',
    reason,
    blockedBy: options?.blockedBy,
    suggestedAction: options?.suggestedAction,
  };
  return buildMachineResponse(result, { ...options, reply: reason });
}

/**
 * Build validation error response
 */
export function buildValidationErrorResponse(
  reason: string,
  validationErrors: string[],
  options?: { requestId?: string; intent?: string; suggestedAction?: string },
): MachineResponseEnvelope {
  const result: MachineResponseValidationError = {
    kind: 'validation_error',
    reason,
    validationErrors,
    suggestedAction: options?.suggestedAction,
  };
  return buildMachineResponse(result, { ...options, reply: reason });
}

/**
 * Build safety error response
 */
export function buildSafetyErrorResponse(
  reason: string,
  options?: {
    requestId?: string;
    intent?: string;
    riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
    suggestedAction?: string;
  },
): MachineResponseEnvelope {
  const result: MachineResponseSafetyError = {
    kind: 'safety_error',
    reason,
    riskLevel: options?.riskLevel,
    suggestedAction: options?.suggestedAction,
  };
  return buildMachineResponse(result, { ...options, reply: reason });
}

/**
 * Build internal error response (safe - no stack traces or secrets)
 */
export function buildInternalErrorResponse(
  error: unknown,
  options?: { requestId?: string; intent?: string; suggestedAction?: string },
): MachineResponseEnvelope {
  const { reason, errorId } = safeErrorSerialize(error);
  const result: MachineResponseInternalError = {
    kind: 'internal_error',
    reason,
    errorId,
    suggestedAction: options?.suggestedAction,
  };
  return buildMachineResponse(result, { ...options, reply: reason });
}

/**
 * Build plan response
 */
export function buildPlanResponse(
  plan: OrchestrationPlan,
  options?: { requestId?: string; intent?: string },
): MachineResponseEnvelope {
  const result: MachineResponsePlan = {
    kind: 'plan',
    plan,
  };
  return buildMachineResponse(result, options);
}

/**
 * Build workflow draft response
 */
export function buildWorkflowDraftResponse(
  workflowDraft: WorkflowDraft,
  options?: { requestId?: string; intent?: string },
): MachineResponseEnvelope {
  const result: MachineResponseWorkflowDraft = {
    kind: 'workflow_draft',
    workflowDraft,
  };
  return buildMachineResponse(result, options);
}

export { formatHumanReadable };
