import { describe, test, expect, vi } from 'vitest';
import { createAuditBridge } from './audit-bridge.js';
import { createNoopAuditHelper, type AuditHelper } from '../../infrastructure/audit/index.js';
import type { AcpToolCallEvent } from '../acp/acp-types.js';
import type { TransportError } from './types.js';

function makeAudit(): AuditHelper {
  return {
    log: vi.fn(),
    cliCommand: vi.fn(),
    cliOutput: vi.fn(),
    workflowStart: vi.fn(),
    workflowEnd: vi.fn(),
    workflowStep: vi.fn(),
    securityAlert: vi.fn(),
    securityAction: vi.fn(),
    configChange: vi.fn(),
    intentMatch: vi.fn(),
    executorResult: vi.fn(),
    fileOperation: vi.fn(),
    sandboxDetect: vi.fn(),
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

describe('createAuditBridge', () => {
  test('onTransportStart calls securityAction EXECUTING', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onTransportStart('task-1', 'opencode');
    expect(audit.securityAction).toHaveBeenCalledWith('TRANSPORT_EXECUTE', 'opencode', 'EXECUTING', 'task-1');
  });

  test('onTransportEnd success calls COMPLETED', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onTransportEnd('task-1', true, 5000);
    expect(audit.securityAction).toHaveBeenCalledWith('TRANSPORT_EXECUTE', '', 'COMPLETED', 'task-1');
  });

  test('onTransportEnd failure calls FAILED', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onTransportEnd('task-1', false, 5000);
    expect(audit.securityAction).toHaveBeenCalledWith('TRANSPORT_EXECUTE', '', 'FAILED', 'task-1');
  });

  test('onTransportFailed calls FAILED', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    const error: TransportError = { code: 'AGENT_CRASHED', message: 'crashed' };
    bridge.onTransportFailed(error);
    expect(audit.securityAction).toHaveBeenCalledWith('TRANSPORT_EXECUTE', '', 'FAILED', '');
  });

  test('onPermission calls securityAction with decision', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onPermission('rm -rf /', 'BLOCKED', 's1');
    expect(audit.securityAction).toHaveBeenCalledWith('ACP_PERMISSION', 'rm -rf /', 'BLOCKED', 's1');
  });

  test('onSecurityBlock calls securityAction + securityAlert', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onSecurityBlock('rm -rf /', 'rm-root');
    expect(audit.securityAction).toHaveBeenCalledWith('ACP_PERMISSION', 'rm -rf /', 'BLOCKED', '');
    expect(audit.securityAlert).toHaveBeenCalledWith('rm-root', 'rm -rf /', 'high', '');
  });

  test('onToolCallResult calls executorResult with exitCode 0 for completed', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onToolCallResult(makeToolCall({ status: 'completed' }), 's1');
    expect(audit.executorResult).toHaveBeenCalledWith('tc1', 'Edit foo.ts', 0, 0, 's1', {
      kind: 'edit',
      locations: [],
    });
  });

  test('onToolCallResult calls executorResult with exitCode 1 for failed', () => {
    const audit = makeAudit();
    const bridge = createAuditBridge(audit);
    bridge.onToolCallResult(makeToolCall({ status: 'failed' }), 's1');
    expect(audit.executorResult).toHaveBeenCalledWith('tc1', 'Edit foo.ts', 1, 0, 's1', expect.anything());
  });

  test('onAcpEvent does not throw', () => {
    const bridge = createAuditBridge(createNoopAuditHelper());
    expect(() => bridge.onAcpEvent({ type: 'message', event: { text: 'hi' } })).not.toThrow();
  });
});
