/**
 * Trace bridge: maps ACP lifecycle events to trace spans.
 * See docs/01-acp-transport.md § ACP 事件 → Trace Span 桥接.
 *
 * Covers all 6 trace spans required by 00-vision.md:
 *   cli.run-task.transport.execute
 *   cli.run-task.transport.acp.initialize
 *   cli.run-task.transport.acp.session.new
 *   cli.run-task.transport.acp.prompt
 *   cli.run-task.transport.acp.permission
 *   cli.run-task.transport.acp.tool_call
 */

import type { TraceContext } from '../../infrastructure/trace/types.js';
import { SpanKind } from '../../infrastructure/trace/types.js';
import { startSpan, type SpanHandle } from '../../infrastructure/trace/tracer.js';
import type { AcpEvent, AcpStopReason, AcpToolCallEvent } from '../acp/acp-types.js';
import type { TransportError, TransportRequest } from './types.js';

export interface TraceBridge {
  onTransportExecute(request: TransportRequest): SpanHandle;
  onTransportExecuteEnd(span: SpanHandle, success: boolean, stopReason?: AcpStopReason, error?: TransportError): void;

  onInitialize(): SpanHandle;
  onInitializeEnd(span: SpanHandle, agentName: string, agentVersion: string): void;

  onSessionStart(sessionId: string): SpanHandle;
  onSessionEnd(span: SpanHandle, stopReason: string): void;

  onPrompt(): SpanHandle;
  onPromptEnd(span: SpanHandle, stopReason: string): void;

  onToolCall(toolCall: AcpToolCallEvent): SpanHandle;
  onToolCallEnd(span: SpanHandle, toolCall: AcpToolCallEvent): void;

  onPermission(toolTitle: string, decision: 'approved' | 'rejected' | 'auto_approved'): SpanHandle;

  onAcpEvent(event: AcpEvent): void;
}

export function createTraceBridge(traceContext: TraceContext, parentSpanId: string): TraceBridge {
  const mk = (name: string, attrs?: Record<string, unknown>): SpanHandle =>
    startSpan(name, { context: traceContext, parentSpanId, kind: SpanKind.CLIENT, attributes: attrs });

  return {
    onTransportExecute(req) {
      return mk('cli.run-task.transport.execute', {
        agentId: req.descriptor.id,
        mode: req.mode,
        timeoutMs: req.timeoutMs,
      });
    },

    onTransportExecuteEnd(span, success, stopReason, error) {
      if (success) {
        void span.end({ stopReason });
      } else {
        void span.fail(error ?? new Error('Transport failed'), { stopReason });
      }
    },

    onInitialize() {
      return mk('cli.run-task.transport.acp.initialize');
    },

    onInitializeEnd(span, agentName, agentVersion) {
      void span.end({ agentName, agentVersion });
    },

    onSessionStart(sessionId) {
      return mk('cli.run-task.transport.acp.session.new', { sessionId });
    },

    onSessionEnd(span, stopReason) {
      void span.end({ stopReason });
    },

    onPrompt() {
      return mk('cli.run-task.transport.acp.prompt');
    },

    onPromptEnd(span, stopReason) {
      void span.end({ stopReason });
    },

    onToolCall(tc) {
      return mk('cli.run-task.transport.acp.tool_call', {
        toolCallId: tc.toolCallId,
        kind: tc.kind,
        title: tc.title,
      });
    },

    onToolCallEnd(span, tc) {
      if (tc.status === 'failed') {
        void span.fail(new Error(`Tool call failed: ${tc.title}`));
      } else {
        void span.end({ status: tc.status });
      }
    },

    onPermission(toolTitle, decision) {
      const span = mk('cli.run-task.transport.acp.permission', { toolTitle, decision });
      void span.end({ decision });
      return span;
    },

    onAcpEvent(_event) {
      // Fine-grained event → update active span attributes if needed.
      // No new span created here; spans are created by the specific on* methods above.
    },
  };
}
