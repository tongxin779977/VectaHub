import type { CommandRule, CommandRuleResult, RuleEngineConfig, DefaultPolicy, RuleMatchResult } from './types.js';
import { matchPattern } from './matcher.js';

/**
 * Evaluates commands against blocklist and allowlist rules to produce a security decision.
 *
 * The engine applies rules in the following priority order:
 * 1. Project blocklist (highest priority)
 * 2. Global blocklist
 * 3. Project allowlist
 * 4. Global allowlist
 * 5. Default policy (fallback)
 */
export class CommandRuleEngine {
  private globalBlocklist: CommandRule[];
  private globalAllowlist: CommandRule[];
  private projectBlocklist: CommandRule[];
  private projectAllowlist: CommandRule[];
  private defaultPolicy: DefaultPolicy;

  constructor(config: RuleEngineConfig) {
    this.globalBlocklist = config.globalBlocklist;
    this.globalAllowlist = config.globalAllowlist;
    this.projectBlocklist = config.projectBlocklist || [];
    this.projectAllowlist = config.projectAllowlist || [];
    this.defaultPolicy = config.defaultPolicy || 'block';
  }

  /** Evaluate a command string and return the security decision with matched rule details. */
  evaluate(fullCommand: string): CommandRuleResult {
    // Check blocklist first
    const blockResult = matchRuleLists([this.projectBlocklist, this.globalBlocklist], fullCommand);
    if (blockResult.matched && blockResult.rule) {
      return {
        decision: 'block',
        matched: true,
        rule: blockResult.rule,
        scope: blockResult.scope,
        message: `⛔ 命令被黑名单拒绝: ${blockResult.rule.reason || '未说明原因'}`,
      };
    }

    // Then check allowlist
    const allowResult = matchRuleLists([this.projectAllowlist, this.globalAllowlist], fullCommand);
    if (allowResult.matched && allowResult.rule) {
      return {
        decision: 'allow',
        matched: true,
        rule: allowResult.rule,
        scope: allowResult.scope,
        message: `✅ 命令命中白名单: ${allowResult.rule.description || allowResult.rule.id}`,
      };
    }

    // Apply default policy
    switch (this.defaultPolicy) {
      case 'block':
        return {
          decision: 'block',
          matched: false,
          message: '⛔ 命令未在白名单中，默认拒绝执行',
        };
      case 'allow':
        return {
          decision: 'allow',
          matched: false,
          message: '✅ 命令未在黑名单中，默认允许执行',
        };
      case 'passthrough':
      default:
        return {
          decision: 'passthrough',
          matched: false,
          message: '未命中黑白名单，交给危险命令检测系统处理',
        };
    }
  }

  /** Get a copy of the global blocklist rules. */
  getGlobalBlocklist(): CommandRule[] {
    return [...this.globalBlocklist];
  }

  /** Get a copy of the global allowlist rules. */
  getGlobalAllowlist(): CommandRule[] {
    return [...this.globalAllowlist];
  }

  /** Get a copy of the project blocklist rules. */
  getProjectBlocklist(): CommandRule[] {
    return [...this.projectBlocklist];
  }

  /** Get a copy of the project allowlist rules. */
  getProjectAllowlist(): CommandRule[] {
    return [...this.projectAllowlist];
  }

  /** Get the configured default policy. */
  getDefaultPolicy(): DefaultPolicy {
    return this.defaultPolicy;
  }
}

/**
 * Match a command against multiple ordered rule lists.
 *
 * Lists are evaluated in order; the first match wins. The returned scope
 * corresponds to which list produced the match (first list = 'project',
 * second = 'global').
 */
function matchRuleLists(lists: [CommandRule[], CommandRule[]], command: string): RuleMatchResult {
  const scopes: Array<'project' | 'global'> = ['project', 'global'];

  for (let i = 0; i < lists.length; i++) {
    for (const rule of lists[i]) {
      if (matchPattern(rule.pattern, command)) {
        return { matched: true, rule, scope: scopes[i] };
      }
    }
  }

  return { matched: false };
}

/**
 * Create a new {@link CommandRuleEngine} instance from the given configuration.
 */
export function createCommandRuleEngine(config: RuleEngineConfig): CommandRuleEngine {
  return new CommandRuleEngine(config);
}
