import type { CommandRule, CommandAnalysis, CommandRuleResult } from './types.js';
import { getSecurityTemplate, DEFAULT_TEMPLATES } from './templates.js';

/**
 * 命令规则引擎依赖接口
 */
export interface CommandRuleEngineDeps {
  /** 日志记录器 */
  logger: Pick<Console, 'warn'>;
}

const silentCommandRuleLogger: CommandRuleEngineDeps['logger'] = {
  warn(): void {},
};

/**
 * 命令规则引擎类
 * 用于分析和评估 CLI 命令的安全性
 */
export class CommandRuleEngine {
  private rules: CommandRule[];
  private readonly logger: Pick<Console, 'warn'>;

  constructor(rules?: CommandRule[], deps: CommandRuleEngineDeps = { logger: silentCommandRuleLogger }) {
    this.rules = rules || DEFAULT_TEMPLATES.default;
    this.logger = deps.logger;
  }

  /** 设置规则列表 */
  setRules(rules: CommandRule[]): void {
    this.rules = rules;
  }

  /** 加载安全模板 */
  loadTemplate(template: 'default' | 'strict' | 'relaxed'): void {
    this.rules = getSecurityTemplate(template);
  }

  private compilePattern(pattern: string): RegExp | null {
    try {
      const regex = new RegExp(pattern);
      return regex;
    } catch {
      this.logger.warn(`Invalid regex pattern: ${pattern}`);
      return null;
    }
  }

  /** 分析命令 */
  analyzeCommand(command: string, args: string[], cwd: string): CommandAnalysis {
    const matchedPatterns: string[] = [];
    let isDangerous = false;
    let dangerLevel: 'low' | 'medium' | 'high' | 'critical' | undefined;

    const fullCommand = [command, ...args].join(' ');

    for (const rule of this.rules) {
      const regex = this.compilePattern(rule.pattern);
      if (!regex) continue;

      if (regex.test(fullCommand)) {
        matchedPatterns.push(rule.pattern);
        if (rule.action === 'block') {
          isDangerous = true;
          dangerLevel = this.inferDangerLevel(rule);
        }
      }
    }

    return {
      command,
      args,
      cwd,
      isDangerous,
      dangerLevel,
      matchedPatterns,
    };
  }

  private inferDangerLevel(rule: CommandRule): 'low' | 'medium' | 'high' | 'critical' {
    if (rule.pattern.includes('rm -rf /') || rule.pattern.includes('/etc/')) {
      return 'critical';
    }
    if (rule.pattern.includes('sudo') || rule.pattern.includes('chmod 777')) {
      return 'high';
    }
    if (rule.pattern.includes('rm -rf')) {
      return 'medium';
    }
    return 'low';
  }

  /** 评估命令 */
  evaluate(command: string, args: string[], cwd: string): CommandRuleResult {
    const analysis = this.analyzeCommand(command, args, cwd);
    if (analysis.isDangerous) {
      const matchedRule = this.rules.find(r => r.pattern === analysis.matchedPatterns[0]);
      return {
        decision: 'block',
        rule: matchedRule,
        scope: matchedRule?.scope || 'default',
      };
    }

    const fullCommand = [command, ...args].join(' ');
    for (const rule of this.rules) {
      const regex = this.compilePattern(rule.pattern);
      if (!regex) continue;
      if (regex.test(fullCommand)) {
        return {
          decision: rule.action,
          rule,
          scope: rule.scope,
        };
      }
    }

    return {
      decision: 'allow',
      scope: 'default',
    };
  }

  /** 获取规则列表 */
  getRules(): CommandRule[] {
    return [...this.rules];
  }

  /** 添加规则 */
  addRule(rule: CommandRule): void {
    this.rules.push(rule);
  }

  /** 移除规则 */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }
}
