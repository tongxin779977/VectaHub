import type { SecurityDecisionType, SecurityRiskLevel } from '../../types/security.js';

/**
 * Maps a severity string to the corresponding SecurityDecisionType and SecurityRiskLevel.
 * Used by evaluators to normalize severity into standard security decisions.
 *
 * @param severity - The severity level string from a detection result
 * @returns The mapped decision type and risk level
 */
export function mapSeverityToDecision(severity: string): {
  decision: SecurityDecisionType;
  riskLevel: SecurityRiskLevel;
} {
  switch (severity) {
    case 'critical':
      return { decision: 'BLOCKED', riskLevel: 'critical' };
    case 'high':
      return { decision: 'REQUIRES_CONFIRMATION', riskLevel: 'high' };
    case 'medium':
      return { decision: 'PASSED', riskLevel: 'medium' };
    case 'low':
      return { decision: 'PASSED', riskLevel: 'low' };
    default:
      return { decision: 'PASSED', riskLevel: 'none' };
  }
}
