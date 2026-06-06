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
import { redactString } from '../utils/sensitive-data.js';

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
    const cleanMessage = error.message
      .replace(/\n\s*at .*/g, '')
      .replace(/\/[^/]*:\d+:\d+/g, '')
      .trim();
    reason = redactString(cleanMessage) || reason;
    errorId = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  } else if (typeof error === 'string') {
    const cleanMessage = error
      .replace(/\n\s*at .*/g, '')
      .replace(/\/[^/]*:\d+:\d+/g, '')
      .trim();
    reason = redactString(cleanMessage) || reason;
  }

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
    reply: redactString(reply),
  };
  return buildMachineResponse(result, { ...options, reply: redactString(reply) });
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
    reason: redactString(reason),
    blockedBy: options?.blockedBy,
    suggestedAction: options?.suggestedAction,
  };
  return buildMachineResponse(result, { ...options, reply: redactString(reason) });
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
 * Recursively redact sensitive data from an object by serializing to JSON and back
 */
function redactSensitiveFields(obj: unknown): unknown {
  const json = JSON.stringify(obj);
  const redacted = JSON.parse(json);
  return redactRecursive(redacted);
}

function redactRecursive(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return redactString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => redactRecursive(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactRecursive(value);
    }
    return result;
  }
  return obj;
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
    plan: redactSensitiveFields(plan) as OrchestrationPlan,
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
    workflowDraft: redactSensitiveFields(workflowDraft) as WorkflowDraft,
  };
  return buildMachineResponse(result, options);
}

export { formatHumanReadable };
