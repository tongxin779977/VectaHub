/**
 * ACP transport execution path for run-task.
 *
 * Replaces the spawn block + heuristic functions with a single
 * transport.execute() call that returns structured results.
 *
 * See docs/01-acp-transport.md § run-task.ts 集成点.
 */

import type { AgentDescriptor } from '../types/agent.js';
import type { SecurityContext } from '../types/security.js';
import type { TraceContext } from '../infrastructure/trace/types.js';
import type { TokenUsage } from './run-task-shared.js';
import type { DocTaskFailureKind } from '../types/doc-task.js';
import type {
  AgentTransport,
  TransportRequest,
  TransportResult,
  TransportError,
} from '../agent-runtime/transport/types.js';
import type { AcpStopReason, AcpToolCallEvent } from '../agent-runtime/acp/acp-types.js';

export interface AcpExecutionInput {
  transport: AgentTransport;
  descriptor: AgentDescriptor;
  workspaceRoot: string;
  taskPrompt: string;
  mode: 'run' | 'dry-run';
  traceContext: TraceContext;
  parentSpanId: string;
  securityContext: SecurityContext;
  timeoutMs: number;
}

export interface AcpExecutionResult {
  success: boolean;
  output: string;
  stopReason: AcpStopReason;
  agentExecutionOutcome: 'implemented' | 'planned_only';
  usage?: TokenUsage;
  changedFiles: string[];
  error?: { code: string; message: string };
  failureKind?: DocTaskFailureKind;
  toolCalls: AcpToolCallEvent[];
}

/** Execute a task via ACP transport and map to run-task-compatible result. */
export async function executeViaAcpTransport(
  input: AcpExecutionInput,
): Promise<AcpExecutionResult> {
  const request: TransportRequest = {
    descriptor: input.descriptor,
    workspaceRoot: input.workspaceRoot,
    taskPrompt: input.taskPrompt,
    mode: input.mode,
    traceContext: input.traceContext,
    parentSpanId: input.parentSpanId,
    securityContext: input.securityContext,
    timeoutMs: input.timeoutMs,
  };

  const result: TransportResult = await input.transport.execute(request);
  return mapTransportToExecutionResult(result);
}

/** Map TransportResult to AcpExecutionResult (run-task-compatible fields). */
export function mapTransportToExecutionResult(result: TransportResult): AcpExecutionResult {
  const agentExecutionOutcome = deriveExecutionOutcome(result.toolCalls);
  const failureKind = result.success ? undefined : deriveFailureKind(result.error, result.stopReason);

  return {
    success: result.success,
    output: result.output,
    stopReason: result.stopReason,
    agentExecutionOutcome,
    usage: result.usage,
    changedFiles: result.changedFiles,
    error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
    failureKind,
    toolCalls: result.toolCalls,
  };
}

/** Derive execution outcome from tool call records (deterministic, no heuristics). */
function deriveExecutionOutcome(toolCalls: AcpToolCallEvent[]): 'implemented' | 'planned_only' {
  const hasCompletedEdit = toolCalls.some(
    (tc) =>
      (tc.kind === 'edit' || tc.kind === 'delete' || tc.kind === 'move') &&
      tc.status === 'completed',
  );
  return hasCompletedEdit ? 'implemented' : 'planned_only';
}

/** Map TransportError + StopReason to DocTaskFailureKind. */
function deriveFailureKind(
  error: TransportError | undefined,
  stopReason: AcpStopReason,
): DocTaskFailureKind {
  if (error) {
    switch (error.code) {
      case 'PROMPT_TIMEOUT':
        return 'timeout';
      case 'PERMISSION_REJECTED':
        return 'agent';
      case 'AGENT_SPAWN_FAILED':
      case 'AGENT_CRASHED':
      case 'INITIALIZE_FAILED':
      case 'SESSION_CREATE_FAILED':
      case 'PROTOCOL_ERROR':
        return 'agent';
      default:
        break;
    }
  }

  switch (stopReason) {
    case 'max_tokens':
    case 'max_turn_requests':
      return 'timeout';
    case 'refusal':
    case 'cancelled':
      return 'agent';
    default:
      return 'agent';
  }
}
