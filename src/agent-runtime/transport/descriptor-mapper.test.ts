import { describe, test, expect } from 'vitest';
import { descriptorToAcpOptions, buildAcpArgs } from './descriptor-mapper.js';
import type { AgentDescriptor } from '../../types/agent.js';
import type { TransportRequest } from './types.js';

function makeDescriptor(overrides: Partial<AgentDescriptor> = {}): AgentDescriptor {
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
    ...overrides,
  };
}

function makeRequest(descriptor: AgentDescriptor): TransportRequest {
  return {
    descriptor,
    workspaceRoot: '/workspace',
    taskPrompt: 'do something',
    mode: 'run',
    traceContext: { traceId: 't1' },
    parentSpanId: 'p1',
    securityContext: { cwd: '/workspace', sessionId: 's1' },
    timeoutMs: 30_000,
    envPatch: { FOO: 'bar' },
  };
}

describe('buildAcpArgs', () => {
  test('returns ["acp"] when no subcommand', () => {
    expect(buildAcpArgs(makeDescriptor())).toEqual(['acp']);
  });

  test('returns [subcommand, "acp"] when subcommand exists', () => {
    expect(buildAcpArgs(makeDescriptor({ subcommand: 'agent' }))).toEqual(['agent', 'acp']);
  });
});

describe('descriptorToAcpOptions', () => {
  test('maps entryCommand to command', () => {
    const opts = descriptorToAcpOptions(makeDescriptor(), makeRequest(makeDescriptor()));
    expect(opts.command).toBe('opencode');
  });

  test('maps workspaceRoot to cwd', () => {
    const opts = descriptorToAcpOptions(makeDescriptor(), makeRequest(makeDescriptor()));
    expect(opts.cwd).toBe('/workspace');
  });

  test('maps timeoutMs', () => {
    const opts = descriptorToAcpOptions(makeDescriptor(), makeRequest(makeDescriptor()));
    expect(opts.timeoutMs).toBe(30_000);
  });

  test('maps envPatch', () => {
    const opts = descriptorToAcpOptions(makeDescriptor(), makeRequest(makeDescriptor()));
    expect(opts.envPatch).toEqual({ FOO: 'bar' });
  });

  test('sets clientName to vectahub', () => {
    const opts = descriptorToAcpOptions(makeDescriptor(), makeRequest(makeDescriptor()));
    expect(opts.clientName).toBe('vectahub');
  });

  test('passes through onPermission', () => {
    const onPermission = async () => ({ optionId: 'test' });
    const req = makeRequest(makeDescriptor());
    req.onPermission = onPermission;
    const opts = descriptorToAcpOptions(makeDescriptor(), req);
    expect(opts.onPermission).toBe(onPermission);
  });
});
