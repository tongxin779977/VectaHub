import { describe, test, expect } from 'vitest';
import { createTraceBridge } from './trace-bridge.js';
import type { TransportRequest } from './types.js';
import type { AgentDescriptor } from '../../types/agent.js';
import type { AcpToolCallEvent } from '../acp/acp-types.js';

function makeDescriptor(): AgentDescriptor {
  return {
    id: 'opencode',
    displayName: 'OpenCode',
    entryCommand: 'opencode',
    promptTransport: 'arg',
    nonInteractiveFlags: [],
    approvalPolicySupport: 'none',
    structuredOutputSupport: false,
    preflightSpec: { versionArgs: [] },
    dryRunRenderMode: 'prompt-only',
  };
}

function makeRequest(): TransportRequest {
  return {
    descriptor: makeDescriptor(),
    workspaceRoot: '/tmp',
    taskPrompt: 'test',
    mode: 'run',
    traceContext: { traceId: 'trace-1', spanId: 'parent-1' },
    parentSpanId: 'parent-1',
    securityContext: { cwd: '/tmp', sessionId: 's1' },
    timeoutMs: 60_000,
  };
}

function makeToolCall(overrides: Partial<AcpToolCallEvent> = {}): AcpToolCallEvent {
  return {
    toolCallId: 'tc1',
    title: 'Edit foo.ts',
    kind: 'edit',
    status: 'completed',
    content: [],
    locations: [],
    ...overrides,
  };
}

describe('createTraceBridge', () => {
  test('onTransportExecute returns a SpanHandle', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onTransportExecute(makeRequest());
    expect(span.spanId).toBeTruthy();
    expect(span.traceId).toBe('t1');
  });

  test('onInitialize returns a SpanHandle', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onInitialize();
    expect(span.spanId).toBeTruthy();
  });

  test('onSessionStart returns a SpanHandle', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onSessionStart('session-123');
    expect(span.spanId).toBeTruthy();
  });

  test('onPrompt returns a SpanHandle', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onPrompt();
    expect(span.spanId).toBeTruthy();
  });

  test('onToolCall returns a SpanHandle', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onToolCall(makeToolCall());
    expect(span.spanId).toBeTruthy();
  });

  test('onPermission returns a SpanHandle', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onPermission('rm -rf /', 'rejected');
    expect(span.spanId).toBeTruthy();
  });

  test('onAcpEvent does not throw', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    expect(() => bridge.onAcpEvent({ type: 'message', event: { text: 'hi' } })).not.toThrow();
  });

  test('onTransportExecuteEnd success does not throw', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onTransportExecute(makeRequest());
    expect(() => bridge.onTransportExecuteEnd(span, true, 'end_turn')).not.toThrow();
  });

  test('onTransportExecuteEnd failure does not throw', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onTransportExecute(makeRequest());
    expect(() => bridge.onTransportExecuteEnd(span, false, undefined, { code: 'AGENT_CRASHED', message: 'crashed' })).not.toThrow();
  });

  test('onToolCallEnd completed does not throw', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onToolCall(makeToolCall({ status: 'completed' }));
    expect(() => bridge.onToolCallEnd(span, makeToolCall({ status: 'completed' }))).not.toThrow();
  });

  test('onToolCallEnd failed does not throw', () => {
    const bridge = createTraceBridge({ traceId: 't1' }, 'p1');
    const span = bridge.onToolCall(makeToolCall({ status: 'failed' }));
    expect(() => bridge.onToolCallEnd(span, makeToolCall({ status: 'failed' }))).not.toThrow();
  });
});
