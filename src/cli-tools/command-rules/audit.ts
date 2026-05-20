import type { CommandRuleAuditEntry, CommandAnalysis, CommandRuleResult } from './types.js';
import { getDefaultContext } from '../../infrastructure/context.js';

function getAuditHelper() {
  return getDefaultContext().audit.getHelper();
}

function getCurrentSessionId(): string {
  return getDefaultContext().audit.getLogger().getSessionId();
}

export class CommandRuleAuditLogger {
  private logs: CommandRuleAuditEntry[];

  constructor() {
    this.logs = [];
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
        sessionId: getCurrentSessionId(),
      },
    };

    this.logs.push(entry);
    this._emitAudit(entry);
    return entry;
  }

  private _emitAudit(entry: CommandRuleAuditEntry): void {
    getAuditHelper().cliCommand('cli-tools:rule-decision', [entry.command], entry.context.sessionId);
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
