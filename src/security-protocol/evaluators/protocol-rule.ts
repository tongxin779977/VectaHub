import type { 
  SecurityEvaluator, 
  CommandIntention, 
  SecurityContext, 
  SecurityDecision,
  SecurityDecisionType,
  SecurityRiskLevel
} from '../../types/security.js';
import { getSecurityManager } from '../manager.js';

/**
 * 安全协议规则评估器
 * 桥接现有的 SecurityProtocolManager，利用内置的正则规则库对命令进行深度风险评估
 */
export class ProtocolRuleEvaluator implements SecurityEvaluator {
  public readonly name = 'ProtocolRuleEvaluator';

  /**
   * 执行评估逻辑
   */
  public async evaluate(intention: CommandIntention, _context: SecurityContext): Promise<SecurityDecision> {
    let result;
    try {
      const manager = getSecurityManager();
      result = manager.detectCommand(intention.rawCommand, intention.tool);
    } catch (error) {
      throw new Error('Security protocol rule evaluation failed', { cause: error });
    }

    let decision: SecurityDecisionType = 'PASSED';
    let riskLevel: SecurityRiskLevel = 'none';

    if (result.isDangerous) {
      // 映射严重程度到决策和风险等级
      switch (result.severity) {
        case 'critical':
          decision = 'BLOCKED';
          riskLevel = 'critical';
          break;
        case 'high':
          decision = 'REQUIRES_CONFIRMATION';
          riskLevel = 'high';
          break;
        case 'medium':
          decision = 'PASSED';
          riskLevel = 'medium';
          break;
        case 'low':
          decision = 'PASSED';
          riskLevel = 'low';
          break;
        default:
          decision = 'PASSED';
          riskLevel = 'none';
      }
    }

    return {
      decision,
      riskLevel,
      ruleName: result.rule?.name,
      reason: result.rule?.description,
      suggestion: this.getSuggestion(riskLevel)
    };
  }

  /**
   * 根据风险等级提供原子性的改进建议
   */
  private getSuggestion(riskLevel: SecurityRiskLevel): string | undefined {
    switch (riskLevel) {
      case 'critical':
        return '此操作已被系统安全策略强制拦截，请检查命令内容或联系管理员。';
      case 'high':
      case 'medium':
        return '此操作具有潜在风险，建议仔细审查命令及其产生的副作用。';
      default:
        return undefined;
    }
  }
}
