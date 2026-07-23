/**
 * Audit bridge: maps ACP lifecycle events to audit records.
 * See docs/01-acp-transport.md § ACP 事件 → Audit 桥接.
 *
 * Covers all 5 audit records required by 00-vision.md:
 *   SECURITY_ACTION  EXECUTING    ← transport.execute start
 *   SECURITY_ACTION  COMPLETED    ← transport.execute success
 *   SECURITY_ACTION  FAILED       ← transport.execute failure
 *   SECURITY_ACTION  BLOCKED      ← permission rejected
 *   EXECUTOR_RESULT               ← per tool_call
 */

import type { AuditHelper } from '../../infrastructure/audit/index.js';
import type { AcpEvent, AcpToolCallEvent } from '../acp/acp-types.js';
import type { TransportError } from './types.js';

export interface AuditBridge {
  onTransportStart(taskId: string, agentId: string): void;
  onTransportEnd(taskId: string, success: boolean, durationMs: number): void;
  onTransportFailed(error: TransportError): void;

  onPermission(toolTitle: string, decision: string, sessionId: string): void;
  onSecurityBlock(toolTitle: string, ruleName: string): void;

  onToolCallResult(toolCall: AcpToolCallEvent, sessionId: string): void;

  onAcpEvent(event: AcpEvent): void;
}

export function createAuditBridge(audit: AuditHelper): AuditBridge {
  return {
    onTransportStart(taskId, agentId) {
      audit.securityAction('TRANSPORT_EXECUTE', agentId, 'EXECUTING', taskId);
    },

    onTransportEnd(taskId, success, _durationMs) {
      audit.securityAction('TRANSPORT_EXECUTE', '', success ? 'COMPLETED' : 'FAILED', taskId);
    },

    onTransportFailed(_error) {
      audit.securityAction('TRANSPORT_EXECUTE', '', 'FAILED', '');
    },

    onPermission(toolTitle, decision, sessionId) {
      audit.securityAction('ACP_PERMISSION', toolTitle, decision, sessionId);
    },

    onSecurityBlock(toolTitle, ruleName) {
      audit.securityAction('ACP_PERMISSION', toolTitle, 'BLOCKED', '');
      audit.securityAlert(ruleName, toolTitle, 'high', '');
    },

    onToolCallResult(tc, sessionId) {
      audit.executorResult(tc.toolCallId, tc.title, tc.status === 'completed' ? 0 : 1, 0, sessionId, {
        kind: tc.kind,
        locations: tc.locations,
      });
    },

    onAcpEvent(_event) {
      // Usage events could trigger telemetry audit if needed in the future.
    },
  };
}
