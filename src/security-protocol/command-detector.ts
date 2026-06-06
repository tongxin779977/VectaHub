import type { SecurityRule, DetectionResult } from './types.js';

/**
 * Handles security command detection against a set of enabled rules.
 * Checks for oversized commands, degraded mode, and regex pattern matching.
 */
export class CommandDetector {
  /**
   * Evaluates a command against enabled security rules.
   * Returns a DetectionResult indicating whether the command is dangerous.
   *
   * @param command - The raw command string to evaluate
   * @param cliTool - Optional CLI tool name for tool-specific rule filtering
   * @param enabledRules - The set of currently enabled security rules
   * @param degradedMode - Whether the security engine is in degraded mode
   * @param logger - Logger for non-fatal warnings (e.g., invalid regex patterns)
   */
  detectCommand(
    command: string,
    cliTool: string | undefined,
    enabledRules: SecurityRule[],
    degradedMode: boolean,
    logger: Pick<Console, 'warn'>,
  ): DetectionResult {
    if (command.length > 10000) {
      return {
        isDangerous: true,
        severity: 'critical',
        matchedPattern: 'command-length-limit',
        rule: {
          id: 'rule-oversized-command',
          name: 'Oversized Command',
          description: 'Command exceeds maximum safe length and is blocked to prevent security bypass',
          category: 'resource',
          severity: 'critical',
          patterns: [],
          enabled: true,
          createdAt: '',
          updatedAt: '',
          source: 'builtin',
        },
      };
    }

    if (degradedMode) {
      return {
        isDangerous: true,
        severity: 'high',
        matchedPattern: 'degraded-mode',
        rule: {
          id: 'rule-degraded-mode',
          name: 'Degraded Security Mode',
          description: 'Security engine is in degraded mode; non-whitelisted commands require confirmation',
          category: 'system',
          severity: 'high',
          patterns: [],
          enabled: true,
          createdAt: '',
          updatedAt: '',
          source: 'builtin',
        },
      };
    }

    const trimmed = command.trim();

    for (const rule of enabledRules) {
      if (cliTool && rule.cliTools && rule.cliTools.length > 0) {
        if (!rule.cliTools.includes(cliTool)) continue;
      }

      for (const pattern of rule.patterns) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(trimmed)) {
            return {
              isDangerous: true,
              rule: { ...rule },
              matchedPattern: pattern,
              severity: rule.severity
            };
          }
        } catch (e) {
          logger.warn(`Invalid regex pattern in rule ${rule.id}:`, e);
        }
      }
    }

    return {
      isDangerous: false,
      severity: 'none'
    };
  }
}
