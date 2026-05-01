import type { CommandDetection } from '../types/index.js';

const DANGEROUS_PATTERNS = {
  critical: [/^sudo\s+/, /^chmod\s+777/, /^rm\s+-rf\s+\/(?!sandbox)/],
  high: [/>\s*\/etc\//, /^mount\s+--bind/],
  medium: [/>\s*\/dev\//, /\|/],
  low: [/^rm\s+-rf\s+node_modules/, /^npm\s+install\s+-g/],
};

export interface Detector {
  detect(command: string): CommandDetection;
  isDangerous(command: string): boolean;
  getDangerLevel(command: string): 'critical' | 'high' | 'medium' | 'low' | 'none';
}

export function createDetector(): Detector {
  return {
    detect(command: string): CommandDetection {
      const level = this.getDangerLevel(command);

      if (level === 'none') {
        return { isDangerous: false, level: 'low' };
      }

      const reasonMap: Record<string, string> = {
        critical: 'Critical system modification',
        high: 'High-risk system file modification',
        medium: 'Medium-risk device/file manipulation',
        low: 'Low-risk potentially destructive command',
      };

      return {
        isDangerous: true,
        level,
        reason: reasonMap[level],
      };
    },

    isDangerous(command: string): boolean {
      return this.getDangerLevel(command) !== 'none';
    },

    getDangerLevel(command: string): 'critical' | 'high' | 'medium' | 'low' | 'none' {
      for (const pattern of DANGEROUS_PATTERNS.critical) {
        if (pattern.test(command)) return 'critical';
      }
      for (const pattern of DANGEROUS_PATTERNS.high) {
        if (pattern.test(command)) return 'high';
      }
      for (const pattern of DANGEROUS_PATTERNS.medium) {
        if (pattern.test(command)) return 'medium';
      }
      for (const pattern of DANGEROUS_PATTERNS.low) {
        if (pattern.test(command)) return 'low';
      }
      return 'none';
    },
  };
}