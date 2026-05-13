import { getSecurityManager } from './manager.js';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface CommandRiskAssessment {
  level: RiskLevel;
  ruleName?: string;
  reason?: string;
  suggestion?: string;
  needsConfirmation: boolean;
}

const SEVERITY_TO_RISK: Record<string, RiskLevel> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

const HIGH_OR_ABOVE: ReadonlySet<RiskLevel> = new Set(['high', 'critical']);

/**
 * Assess the risk of a command string using the SecurityProtocolManager rule engine.
 * Performance target: < 5ms per call (regex matching only, no I/O).
 */
export function assessCommandRisk(command: string, cliTool?: string): CommandRiskAssessment {
  const manager = getSecurityManager();
  const detection = manager.detectCommand(command, cliTool);

  if (!detection.isDangerous || !detection.severity || detection.severity === 'none') {
    return {
      level: 'safe',
      needsConfirmation: false,
    };
  }

  const level: RiskLevel = SEVERITY_TO_RISK[detection.severity] ?? 'medium';
  const needsConfirmation = HIGH_OR_ABOVE.has(level);

  return {
    level,
    ruleName: detection.rule?.name,
    reason: detection.rule?.description,
    suggestion: level === 'critical'
      ? '此命令已被安全策略阻断，无法执行。'
      : level === 'high'
        ? '此命令被评估为高风险，需要人工确认后方可继续。'
        : undefined,
    needsConfirmation,
  };
}