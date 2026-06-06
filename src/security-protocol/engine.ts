import { getSecurityGuard } from './factory.js';
import type { CommandIntention, SecurityContext } from '../types/security.js';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface CommandRiskAssessment {
  level: RiskLevel;
  ruleName?: string;
  reason?: string;
  suggestion?: string;
  needsConfirmation: boolean;
}

/**
 * 评估命令风险的异步版本
 * 遵循新的安全防线架构，整合了静态规则、语义检测和正则库
 */
export async function assessCommandRisk(command: string, cliTool?: string): Promise<CommandRiskAssessment> {
  const guard = getSecurityGuard();
  const intention: CommandIntention = {
    rawCommand: command,
    tool: cliTool,
  };
  const context: SecurityContext = {
    cwd: process.cwd(),
    sessionId: 'legacy-engine-session',
  };

  const decision = await guard.assess(intention, context);

  return {
    level: (decision.riskLevel === 'none' ? 'safe' : decision.riskLevel) as RiskLevel,
    ruleName: decision.ruleName,
    reason: decision.reason,
    suggestion: decision.suggestion,
    needsConfirmation: decision.decision === 'REQUIRES_CONFIRMATION' || decision.decision === 'BLOCKED',
  };
}