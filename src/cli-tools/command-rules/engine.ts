import type { CommandRule, CommandRuleAction, CommandAnalysis, CommandRuleResult } from './types.js';
import { getSecurityTemplate, DEFAULT_TEMPLATES } from './templates.js';

export class CommandRuleEngine {
  private rules: CommandRule[];

  constructor(rules?: CommandRule[]) {
    this.rules = rules || DEFAULT_TEMPLATES.default;
  }

  setRules(rules: CommandRule[]): void {
    this.rules = rules;
  }

  loadTemplate(template: 'default' | 'strict' | 'relaxed'): void {
    this.rules = getSecurityTemplate(template);
  }

  private compilePattern(pattern: string): RegExp | null {
    try {
      const regex = new RegExp(pattern);
      return regex;
    } catch {
      console.warn(`Invalid regex pattern: ${pattern}`);
      return null;
    }
  }

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

  evaluate(command: string, args: string[], cwd: string): CommandRuleResult {
    const analysis = this.analyzeCommand(command, args, cwd);
    if (analysis.isDangerous) {
      return {
        decision: 'block',
        rule: this.rules.find(r => r.pattern === analysis.matchedPatterns[0])!,
        scope: this.rules.find(r => r.pattern === analysis.matchedPatterns[0])?.scope || 'default',
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

  getRules(): CommandRule[] {
    return [...this.rules];
  }

  addRule(rule: CommandRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }
}