/**
 * Transport layer type definitions.
 *
 * These types are the authoritative definition point for the ACP transport
 * interface. See docs/01-acp-transport.md § 核心接口.
 *
 * Consumed by: 03-workflow-engine, 04-document-task, 07-infrastructure.
 */

import type { AgentDescriptor } from '../../types/agent.js';
import type { SecurityContext } from '../../types/security.js';
import type { TraceContext } from '../../infrastructure/trace/types.js';
import type { SpanHandle } from '../../infrastructure/trace/tracer.js';
import type {
  AcpEvent,
  AcpStopReason,
  AcpToolCallEvent,
  AcpClientOptions,
} from '../acp/acp-types.js';
import type { TokenUsage } from '../../commands/run-task-shared.js';

/** Transport strategy interface. ACP is the only implementation; HTTP is future. */
export interface AgentTransport {
  readonly kind: string;
  execute(request: TransportRequest): Promise<TransportResult>;
  probe(descriptor: AgentDescriptor): Promise<boolean>;
}

/** Unified input for any transport strategy. */
export interface TransportRequest {
  descriptor: AgentDescriptor;
  workspaceRoot: string;
  taskPrompt: string;
  mode: 'run' | 'dry-run';
  traceContext: TraceContext;
  parentSpanId: string;
  securityContext: SecurityContext;
  envPatch?: Record<string, string>;
  timeoutMs: number;
  onPermission?: AcpClientOptions['onPermission'];
}

/** Unified output from any transport strategy. */
export interface TransportResult {
  success: boolean;
  output: string;
  toolCalls: AcpToolCallEvent[];
  stopReason: AcpStopReason;
  usage?: TokenUsage;
  changedFiles: string[];
  events: AcpEvent[];
  error?: TransportError;
}

/** Structured error returned in TransportResult when success is false. */
export interface TransportError {
  code: TransportErrorCode;
  message: string;
  cause?: unknown;
}

export type TransportErrorCode =
  | 'AGENT_SPAWN_FAILED'
  | 'AGENT_CRASHED'
  | 'INITIALIZE_FAILED'
  | 'SESSION_CREATE_FAILED'
  | 'PROMPT_TIMEOUT'
  | 'PERMISSION_REJECTED'
  | 'PROTOCOL_ERROR'
  | 'UNKNOWN';

/** Re-exported for downstream consumers that need SpanHandle in bridge signatures. */
export type { SpanHandle };
