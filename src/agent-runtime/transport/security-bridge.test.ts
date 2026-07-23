import { describe, test, expect, vi } from 'vitest';
import {
  handleAcpPermission,
  buildIntentionFromAcpTool,
  findOption,
  type AcpPermissionRequest,
} from './security-bridge.js';
import type { SecurityGuard, SecurityContext, SecurityDecision } from '../../types/security.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';

function makeOptions() {
  return [
    { optionId: 'opt-allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'opt-always', name: 'Always allow', kind: 'allow_always' },
    { optionId: 'opt-reject', name: 'Reject', kind: 'reject_once' },
  ];
}

function makeRequest(kind: string, title: string): AcpPermissionRequest {
  return { toolCall: { title, kind: kind as never }, options: makeOptions() };
}

function makeGuard(decision: SecurityDecision): SecurityGuard {
  return {
    assess: vi.fn(async () => decision),
    redactOutput: vi.fn((s: string) => s),
  };
}

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

function makeContext(): SecurityContext {
  return { cwd: '/tmp', sessionId: 's1' };
}

describe('buildIntentionFromAcpTool', () => {
  test('execute → rawCommand is title, tool is bash', () => {
    const intention = buildIntentionFromAcpTool('execute', 'echo hello');
    expect(intention.rawCommand).toBe('echo hello');
    expect(intention.tool).toBe('bash');
  });

  test('edit → rawCommand is "edit <title>", tool is edit', () => {
    const intention = buildIntentionFromAcpTool('edit', '/src/foo.ts');
    expect(intention.rawCommand).toBe('edit /src/foo.ts');
    expect(intention.tool).toBe('edit');
  });

  test('read → tool is read', () => {
    const intention = buildIntentionFromAcpTool('read', '/src/foo.ts');
    expect(intention.tool).toBe('read');
  });

  test('other → tool is other', () => {
    const intention = buildIntentionFromAcpTool('other', 'something');
    expect(intention.tool).toBe('other');
  });
});

describe('findOption', () => {
  test('finds allow_once', () => {
    expect(findOption(makeOptions(), 'allow_once')).toBe('opt-allow');
  });

  test('falls back to reject_once when kind not found', () => {
    expect(findOption(makeOptions(), 'nonexistent')).toBe('opt-reject');
  });

  test('returns first option when no reject_once available', () => {
    const opts = [{ optionId: 'only', name: 'Only', kind: 'allow_once' }];
    expect(findOption(opts, 'reject_once')).toBe('only');
  });
});

describe('handleAcpPermission', () => {
  test('auto-approves think tools', async () => {
    const guard = makeGuard({ decision: 'PASSED', riskLevel: 'none' });
    const audit = makeAudit();
    const result = await handleAcpPermission(makeRequest('think', 'thinking'), guard, makeContext(), audit);
    expect(result).toEqual({ optionId: 'opt-allow' });
    expect(guard.assess).not.toHaveBeenCalled();
    expect(audit.securityAction).toHaveBeenCalledWith('ACP_PERMISSION', 'thinking', 'AUTO_APPROVED', 's1');
  });

  test('PASSED → allow_once', async () => {
    const guard = makeGuard({ decision: 'PASSED', riskLevel: 'none' });
    const result = await handleAcpPermission(makeRequest('execute', 'ls'), guard, makeContext(), makeAudit());
    expect(result).toEqual({ optionId: 'opt-allow' });
  });

  test('BLOCKED → reject_once + securityAlert', async () => {
    const guard = makeGuard({ decision: 'BLOCKED', riskLevel: 'high', ruleName: 'rm-root' });
    const audit = makeAudit();
    const result = await handleAcpPermission(makeRequest('execute', 'rm -rf /'), guard, makeContext(), audit);
    expect(result).toEqual({ optionId: 'opt-reject' });
    expect(audit.securityAlert).toHaveBeenCalledWith('rm-root', 'rm -rf /', 'high', 's1');
  });

  test('REQUIRES_CONFIRMATION → reject_once', async () => {
    const guard = makeGuard({ decision: 'REQUIRES_CONFIRMATION', riskLevel: 'medium' });
    const result = await handleAcpPermission(makeRequest('execute', 'sudo ls'), guard, makeContext(), makeAudit());
    expect(result).toEqual({ optionId: 'opt-reject' });
  });

  test('REDACTED → allow_once', async () => {
    const guard = makeGuard({ decision: 'REDACTED', riskLevel: 'low' });
    const result = await handleAcpPermission(makeRequest('execute', 'cat .env'), guard, makeContext(), makeAudit());
    expect(result).toEqual({ optionId: 'opt-allow' });
  });
});
