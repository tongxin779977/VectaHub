import { describe, test, expect } from 'vitest';
import {
  AcpProtocolError,
  ProcessExitError,
  TimeoutError,
  mapErrorToTransportError,
  stopToErrorCode,
} from './error-mapper.js';
import type { TransportRequest } from './types.js';
import type { AgentDescriptor } from '../../types/agent.js';

function makeRequest(overrides: Partial<TransportRequest> = {}): TransportRequest {
  return {
    descriptor: { id: 'opencode', displayName: 'OpenCode', entryCommand: 'opencode', promptTransport: 'arg', nonInteractiveFlags: [], approvalPolicySupport: 'none', structuredOutputSupport: false, preflightSpec: { versionArgs: [] }, dryRunRenderMode: 'prompt-only' } as AgentDescriptor,
    workspaceRoot: '/tmp',
    taskPrompt: 'test',
    mode: 'run',
    traceContext: { traceId: 'test' },
    parentSpanId: '',
    securityContext: { cwd: '/tmp', sessionId: 's1' },
    timeoutMs: 60_000,
    ...overrides,
  };
}

describe('mapErrorToTransportError', () => {
  test('maps ENOENT to AGENT_SPAWN_FAILED', () => {
    const err = new Error('spawn error ENOENT');
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('AGENT_SPAWN_FAILED');
    expect(result.message).toContain('not found');
  });

  test('maps EACCES to AGENT_SPAWN_FAILED', () => {
    const err = new Error('spawn error EACCES');
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('AGENT_SPAWN_FAILED');
    expect(result.message).toContain('Permission denied');
  });

  test('maps AcpProtocolError initialize to INITIALIZE_FAILED', () => {
    const err = new AcpProtocolError('handshake failed', 'initialize');
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('INITIALIZE_FAILED');
  });

  test('maps AcpProtocolError session_new to SESSION_CREATE_FAILED', () => {
    const err = new AcpProtocolError('session failed', 'session_new');
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('SESSION_CREATE_FAILED');
  });

  test('maps AcpProtocolError other to PROTOCOL_ERROR', () => {
    const err = new AcpProtocolError('unexpected', 'other');
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('PROTOCOL_ERROR');
  });

  test('maps ProcessExitError to AGENT_CRASHED', () => {
    const err = new ProcessExitError('crashed', 1);
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('AGENT_CRASHED');
    expect(result.message).toContain('code=1');
  });

  test('maps TimeoutError to PROMPT_TIMEOUT', () => {
    const err = new TimeoutError('timed out');
    const result = mapErrorToTransportError(err, makeRequest());
    expect(result.code).toBe('PROMPT_TIMEOUT');
    expect(result.message).toContain('60000');
  });

  test('maps unknown error to UNKNOWN', () => {
    const result = mapErrorToTransportError('string error', makeRequest());
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('string error');
  });
});

describe('stopToErrorCode', () => {
  test('max_tokens → PROMPT_TIMEOUT', () => {
    expect(stopToErrorCode('max_tokens')).toBe('PROMPT_TIMEOUT');
  });

  test('max_turn_requests → PROMPT_TIMEOUT', () => {
    expect(stopToErrorCode('max_turn_requests')).toBe('PROMPT_TIMEOUT');
  });

  test('refusal → PERMISSION_REJECTED', () => {
    expect(stopToErrorCode('refusal')).toBe('PERMISSION_REJECTED');
  });

  test('cancelled → PERMISSION_REJECTED', () => {
    expect(stopToErrorCode('cancelled')).toBe('PERMISSION_REJECTED');
  });

  test('end_turn → UNKNOWN', () => {
    expect(stopToErrorCode('end_turn')).toBe('UNKNOWN');
  });
});
