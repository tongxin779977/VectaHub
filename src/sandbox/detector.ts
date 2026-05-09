import type { CommandDetection, DangerCategory } from '../types/index.js';
import { getSecurityManager } from '../security-protocol/index.js';
import { ShellTokenizer } from '../utils/shell-tokenizer.js';

const CATEGORY_MAP: Record<string, DangerCategory> = {
  system: 'SYSTEM',
  filesystem: 'FS',
  network: 'NETWORK',
  resource: 'RESOURCE',
};

const DANGEROUS_PATTERNS = {
  critical: [
    /^sudo\s+/,
    /^chmod\s+777/,
    /^rm\s+-rf\s+\/(?!sandbox)/,
    /^dd\s+.*\s+of=\/dev\//,
    /^mkfs/,
    /^shutdown/,
    /^reboot/,
    /^init\s+6/,
    /^telinit/,
    /:()\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
    /\|\s*sh\s*\|/,
    /^while\s+true\s*;\s*do/,
  ],
  high: [
    />\s*\/etc\//,
    />\s*\/boot\//,
    /^mv\s+\/\s+/,
    /^ln\s+-sf\s+.*\s+\/(bin|etc|lib|usr|var)/,
    /^mount\s+--bind/,
    /^iptables/,
    /^ip\s+link\s+delete/,
    /^ifconfig\s+down/,
  ],
  medium: [
    />\s*\/dev\//,
    /\||&/,
    />\s*\$\(/,
    />\s*`/,
    /^eval\s+/,
  ],
  low: [
    /^rm\s+-rf\s+node_modules/,
    /^npm\s+install\s+-g/,
  ],
};

export interface Detector {
  detect(command: string, cliTool?: string): CommandDetection;
  isDangerous(command: string, cliTool?: string): boolean;
  getDangerLevel(command: string, cliTool?: string): {
    level: 'critical' | 'high' | 'medium' | 'low' | 'none';
    matchedPattern?: RegExp;
  };
}

export function createDetector(): Detector {
  let securityManager: ReturnType<typeof getSecurityManager> | null = null;

  const getManager = () => {
    if (!securityManager) {
      securityManager = getSecurityManager();
    }
    return securityManager;
  };

  return {
    detect(command: string, cliTool?: string): CommandDetection {
      // 1. 分解复合命令 (解决管道、&&, ||, ; 绕过)
      const subCommands = ShellTokenizer.tokenize(command);
      
      for (const subCmd of subCommands) {
        const cmdText = subCmd.raw;
        
        // 先走 Security Manager (RBAC)
        const securityResult = getManager().detectCommand(cmdText, cliTool || subCmd.cli);
        
        if (securityResult.isDangerous && securityResult.rule) {
          return {
            isDangerous: true,
            level: securityResult.severity as any,
            reason: securityResult.rule.description,
            matchedPattern: securityResult.matchedPattern,
            category: CATEGORY_MAP[securityResult.rule.category] || 'SYSTEM',
          };
        }

        // 后走内置危险正则检测
        const { level, matchedPattern } = this.getDangerLevel(cmdText, cliTool || subCmd.cli);

        if (level !== 'none') {
          const reasonMap: Record<string, string> = {
            critical: 'Critical system modification detected',
            high: 'High-risk system operation detected',
            medium: 'Medium-risk command pattern detected',
            low: 'Low-risk potentially destructive command',
          };

          return {
            isDangerous: true,
            level,
            reason: reasonMap[level],
            matchedPattern: matchedPattern?.toString(),
          };
        }
      }

      return { isDangerous: false, level: 'none' };
    },

    isDangerous(command: string, cliTool?: string): boolean {
      return this.detect(command, cliTool).isDangerous;
    },

    getDangerLevel(command: string, cliTool?: string): {
      level: 'critical' | 'high' | 'medium' | 'low' | 'none';
      matchedPattern?: RegExp;
    } {
      const securityResult = getManager().detectCommand(command, cliTool);
      if (securityResult.isDangerous) {
        return {
          level: securityResult.severity as any,
        };
      }

      for (const pattern of DANGEROUS_PATTERNS.critical) {
        if (pattern.test(command)) return { level: 'critical', matchedPattern: pattern };
      }
      for (const pattern of DANGEROUS_PATTERNS.high) {
        if (pattern.test(command)) return { level: 'high', matchedPattern: pattern };
      }
      for (const pattern of DANGEROUS_PATTERNS.medium) {
        if (pattern.test(command)) return { level: 'medium', matchedPattern: pattern };
      }
      for (const pattern of DANGEROUS_PATTERNS.low) {
        if (pattern.test(command)) return { level: 'low', matchedPattern: pattern };
      }
      return { level: 'none' };
    },
  };
}