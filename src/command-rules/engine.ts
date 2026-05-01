import type { CommandRule, CommandRuleResult, RuleEngineConfig, DefaultPolicy } from './types.js';
import { matchPattern } from './matcher.js';

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

  evaluate(fullCommand: string): CommandRuleResult {
    // 先检查黑名单
    const blockResult = this.matchBlocklist(fullCommand);
    if (blockResult.matched && blockResult.rule) {
      return {
        decision: 'block',
        matched: true,
        rule: blockResult.rule,
        scope: blockResult.scope,
        message: `⛔ 命令被黑名单拒绝: ${blockResult.rule.reason || '未说明原因'}`,
      };
    }

    // 再检查白名单
    const allowResult = this.matchAllowlist(fullCommand);
    if (allowResult.matched && allowResult.rule) {
      return {
        decision: 'allow',
        matched: true,
        rule: allowResult.rule,
        scope: allowResult.scope,
        message: `✅ 命令命中白名单: ${allowResult.rule.description || allowResult.rule.id}`,
      };
    }

    // 应用默认策略
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

  private matchBlocklist(fullCommand: string): { matched: boolean; rule?: CommandRule; scope?: 'global' | 'project' } {
    for (const rule of this.projectBlocklist) {
      if (matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'project' };
      }
    }

    for (const rule of this.globalBlocklist) {
      if (matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'global' };
      }
    }

    return { matched: false };
  }

  private matchAllowlist(fullCommand: string): { matched: boolean; rule?: CommandRule; scope?: 'global' | 'project' } {
    for (const rule of this.projectAllowlist) {
      if (matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'project' };
      }
    }

    for (const rule of this.globalAllowlist) {
      if (matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'global' };
      }
    }

    return { matched: false };
  }

  getGlobalBlocklist(): CommandRule[] {
    return [...this.globalBlocklist];
  }

  getGlobalAllowlist(): CommandRule[] {
    return [...this.globalAllowlist];
  }

  getProjectBlocklist(): CommandRule[] {
    return [...this.projectBlocklist];
  }

  getProjectAllowlist(): CommandRule[] {
    return [...this.projectAllowlist];
  }

  getDefaultPolicy(): DefaultPolicy {
    return this.defaultPolicy;
  }
}

export function createCommandRuleEngine(config: RuleEngineConfig): CommandRuleEngine {
  return new CommandRuleEngine(config);
}
