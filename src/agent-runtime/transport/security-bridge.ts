/**
 * Security bridge: maps ACP permission requests to SecurityGuard assessments.
 * See docs/01-acp-transport.md § ACP Permission → SecurityGuard 映射.
 *
 * Handles all 4 SecurityDecisionType values:
 *   PASSED → allow_once
 *   BLOCKED → reject_once + securityAlert
 *   REQUIRES_CONFIRMATION → reject_once (auto, future: user UI)
 *   REDACTED → allow_once (output redacted at event layer)
 */

import type { SecurityGuard, SecurityContext, CommandIntention } from '../../types/security.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';
import type { AcpToolKind } from '../acp/acp-types.js';

export interface AcpPermissionRequest {
  toolCall: {
    title: string;
    kind: AcpToolKind;
  };
  options: {
    optionId: string;
    name: string;
    kind: string;
  }[];
}

export type PermissionResult = { optionId: string } | { cancelled: true };

/** Handle an ACP permission request by routing through SecurityGuard. */
export async function handleAcpPermission(
  request: AcpPermissionRequest,
  guard: SecurityGuard,
  context: SecurityContext,
  audit: AuditHelper,
): Promise<PermissionResult> {
  const { title, kind } = request.toolCall;

  if (kind === 'think' || kind === 'switch_mode') {
    audit.securityAction('ACP_PERMISSION', title, 'AUTO_APPROVED', context.sessionId);
    return { optionId: findOption(request.options, 'allow_once') };
  }

  const intention = buildIntentionFromAcpTool(kind, title);
  const decision = await guard.assess(intention, context);
  audit.securityAction('ACP_PERMISSION', title, decision.decision, context.sessionId);

  switch (decision.decision) {
    case 'PASSED':
      return { optionId: findOption(request.options, 'allow_once') };

    case 'BLOCKED':
      audit.securityAlert(decision.ruleName ?? 'unknown', title, decision.riskLevel, context.sessionId);
      return { optionId: findOption(request.options, 'reject_once') };

    case 'REQUIRES_CONFIRMATION':
      return { optionId: findOption(request.options, 'reject_once') };

    case 'REDACTED':
      return { optionId: findOption(request.options, 'allow_once') };

    default: {
      void (decision.decision satisfies never);
      return { cancelled: true };
    }
  }
}

/** Build a CommandIntention from ACP tool kind + title. */
export function buildIntentionFromAcpTool(kind: AcpToolKind, title: string): CommandIntention {
  switch (kind) {
    case 'execute':
      return { rawCommand: title, tool: 'bash' };
    case 'edit':
    case 'delete':
    case 'read':
    case 'move':
    case 'search':
    case 'fetch':
      return { rawCommand: `${kind} ${title}`, tool: kind };
    default:
      return { rawCommand: title, tool: kind };
  }
}

/** Find an option by kind, falling back to reject_once. */
export function findOption(options: AcpPermissionRequest['options'], kind: string): string {
  const opt = options.find((o) => o.kind === kind);
  if (opt) return opt.optionId;

  const reject = options.find((o) => o.kind === 'reject_once');
  if (reject) return reject.optionId;

  return options[0]?.optionId ?? '';
}
