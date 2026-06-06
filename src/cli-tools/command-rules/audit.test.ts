import { describe, it, expect, vi } from 'vitest';
import { CommandRuleAuditLogger } from './audit.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';
import type { CommandAnalysis, CommandRuleResult } from './types.js';

function createMockAuditHelper(): AuditHelper {
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

const mockAnalysis: CommandAnalysis = {
  command: 'ls',
  isShell: false,
  hasPipe: false,
  hasRedirect: false,
  hasLogicalChain: false,
  hasSubshell: false,
  flags: [],
  segments: [{ command: 'ls', args: [] }],
};

const mockResult: CommandRuleResult = {
  decision: 'allow',
  scope: 'global',
  rule: { id: 'test-rule', pattern: 'ls', decision: 'allow', reason: 'safe command' },
};

describe('CommandRuleAuditLogger', () => {
  it('should log decision with injected sessionId', () => {
    const auditHelper = createMockAuditHelper();
    const logger = new CommandRuleAuditLogger({
      auditHelper,
      sessionIdProvider: () => 'test-session-123',
    });

    const entry = logger.logDecision('ls', mockAnalysis, mockResult, 'STRICT', '/tmp');

    expect(entry.command).toBe('ls');
    expect(entry.context.sessionId).toBe('test-session-123');
    expect(entry.decision.result).toBe('allow');
  });

  it('should emit audit event via injected auditHelper', () => {
    const auditHelper = createMockAuditHelper();
    const logger = new CommandRuleAuditLogger({
      auditHelper,
      sessionIdProvider: () => 'session-456',
    });

    logger.logDecision('rm -rf /', mockAnalysis, mockResult, 'STRICT', '/tmp');

    expect(auditHelper.cliCommand).toHaveBeenCalledWith(
      'cli-tools:rule-decision',
      ['rm -rf /'],
      'session-456',
    );
  });

  it('should store and retrieve logs', () => {
    const auditHelper = createMockAuditHelper();
    const logger = new CommandRuleAuditLogger({
      auditHelper,
      sessionIdProvider: () => 'session',
    });

    logger.logDecision('cmd1', mockAnalysis, mockResult, 'STRICT', '/tmp');
    logger.logDecision('cmd2', mockAnalysis, mockResult, 'STRICT', '/tmp');

    expect(logger.getLogs()).toHaveLength(2);
    expect(logger.getRecentLogs(1)).toHaveLength(1);
    expect(logger.getRecentLogs(1)[0].command).toBe('cmd2');
  });

  it('should clear logs', () => {
    const auditHelper = createMockAuditHelper();
    const logger = new CommandRuleAuditLogger({
      auditHelper,
      sessionIdProvider: () => 'session',
    });

    logger.logDecision('cmd', mockAnalysis, mockResult, 'STRICT', '/tmp');
    expect(logger.getLogs()).toHaveLength(1);

    logger.clearLogs();
    expect(logger.getLogs()).toHaveLength(0);
  });
});
