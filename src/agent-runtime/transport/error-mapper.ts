/**
 * Maps raw errors and ACP stop reasons to structured TransportError.
 * See docs/01-acp-transport.md § 错误处理与超时策略.
 */

import type { AcpStopReason } from '../acp/acp-types.js';
import type { TransportError, TransportErrorCode, TransportRequest } from './types.js';

/** Error thrown when ACP protocol handshake fails at a specific phase. */
export class AcpProtocolError extends Error {
  constructor(
    message: string,
    readonly phase: 'initialize' | 'session_new' | 'prompt' | 'other',
  ) {
    super(message);
    this.name = 'AcpProtocolError';
  }
}

/** Error thrown when the agent process exits unexpectedly. */
export class ProcessExitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = 'ProcessExitError';
  }
}

/** Error thrown when the prompt turn exceeds timeoutMs. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Map a caught error to a structured TransportError. */
export function mapErrorToTransportError(err: unknown, request: TransportRequest): TransportError {
  if (err instanceof Error) {
    if (err.message.includes('ENOENT')) {
      return {
        code: 'AGENT_SPAWN_FAILED',
        message: `Agent binary not found: ${request.descriptor.entryCommand}`,
        cause: err,
      };
    }
    if (err.message.includes('EACCES')) {
      return {
        code: 'AGENT_SPAWN_FAILED',
        message: `Permission denied: ${request.descriptor.entryCommand}`,
        cause: err,
      };
    }
  }

  if (err instanceof AcpProtocolError) {
    if (err.phase === 'initialize') {
      return { code: 'INITIALIZE_FAILED', message: err.message, cause: err };
    }
    if (err.phase === 'session_new') {
      return { code: 'SESSION_CREATE_FAILED', message: err.message, cause: err };
    }
    return { code: 'PROTOCOL_ERROR', message: err.message, cause: err };
  }

  if (err instanceof ProcessExitError) {
    return {
      code: 'AGENT_CRASHED',
      message: `Agent process exited unexpectedly (code=${err.exitCode})`,
      cause: err,
    };
  }

  if (err instanceof TimeoutError) {
    return {
      code: 'PROMPT_TIMEOUT',
      message: `Agent timed out after ${request.timeoutMs}ms`,
      cause: err,
    };
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    cause: err,
  };
}

/** Map an ACP StopReason to a TransportErrorCode. */
export function stopToErrorCode(stopReason: AcpStopReason): TransportErrorCode {
  switch (stopReason) {
    case 'max_tokens':
      return 'PROMPT_TIMEOUT';
    case 'max_turn_requests':
      return 'PROMPT_TIMEOUT';
    case 'refusal':
      return 'PERMISSION_REJECTED';
    case 'cancelled':
      return 'PERMISSION_REJECTED';
    default:
      return 'UNKNOWN';
  }
}
