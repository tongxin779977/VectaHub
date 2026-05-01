export type CommandRuleAction = 'allow' | 'block' | 'prompt' | 'sanitize';

export interface CommandRule {
  id: string;
  pattern: string;
  action: CommandRuleAction;
  reason?: string;
  description?: string;
  scope?: string;
}

export type SecurityTemplate = 'default' | 'strict' | 'relaxed';

export interface CommandAnalysis {
  command: string;
  args: string[];
  cwd: string;
  isDangerous: boolean;
  dangerLevel?: 'low' | 'medium' | 'high' | 'critical';
  matchedPatterns: string[];
}

export interface CommandRuleResult {
  decision: CommandRuleAction;
  rule?: CommandRule;
  scope?: string;
}

export interface CommandRuleAuditEntry {
  id: string;
  timestamp: string;
  command: string;
  analysis: CommandAnalysis;
  decision: {
    result: CommandRuleAction;
    ruleId?: string;
    scope?: string;
    reason?: string;
  };
  context: {
    sandboxMode: string;
    cwd: string;
    sessionId: string;
  };
}