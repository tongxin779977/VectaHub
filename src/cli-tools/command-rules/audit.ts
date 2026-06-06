import type { CommandRuleAuditEntry, CommandAnalysis, CommandRuleResult } from './types.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';

export interface CommandRuleAuditLoggerDeps {
  auditHelper: AuditHelper;
  sessionIdProvider: () => string;
}

export class CommandRuleAuditLogger {
  private logs: CommandRuleAuditEntry[];
  private auditHelper: AuditHelper;
  private sessionIdProvider: () => string;

  constructor(deps: CommandRuleAuditLoggerDeps) {
    this.logs = [];
    this.auditHelper = deps.auditHelper;
    this.sessionIdProvider = deps.sessionIdProvider;
  }

  logDecision(
    command: string,
    analysis: CommandAnalysis,
    result: CommandRuleResult,
    sandboxMode: string,
    cwd: string
  ): CommandRuleAuditEntry {
    const entry: CommandRuleAuditEntry = {
      id: `audit-rule-${Date.now()}`,
      timestamp: new Date().toISOString(),
      command,
      analysis,
      decision: {
        result: result.decision,
        ruleId: result.rule?.id,
        scope: result.scope,
        reason: result.rule?.reason,
      },
      context: {
        sandboxMode,
        cwd,
        sessionId: this.sessionIdProvider(),
      },
    };

    this.logs.push(entry);
    this._emitAudit(entry);
    return entry;
  }

  private _emitAudit(entry: CommandRuleAuditEntry): void {
    this.auditHelper.cliCommand('cli-tools:rule-decision', [entry.command], entry.context.sessionId);
  }

  getLogs(): CommandRuleAuditEntry[] {
    return [...this.logs];
  }

  getRecentLogs(limit = 100): CommandRuleAuditEntry[] {
    return [...this.logs.slice(-limit)];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
