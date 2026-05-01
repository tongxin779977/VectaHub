export interface CommandRule {
  id: string;
  pattern: string;
  action: 'block' | 'allow';
  reason?: string;
  description?: string;
  examples?: string[];
}

export interface CommandRuleResult {
  decision: 'block' | 'allow' | 'passthrough';
  matched: boolean;
  rule?: CommandRule;
  scope?: 'global' | 'project';
  message: string;
}

export interface CommandRuleSet {
  version: string;
  description: string;
  rules: CommandRule[];
}

export interface RuleEngineConfig {
  globalBlocklist: CommandRule[];
  globalAllowlist: CommandRule[];
  projectBlocklist?: CommandRule[];
  projectAllowlist?: CommandRule[];
}