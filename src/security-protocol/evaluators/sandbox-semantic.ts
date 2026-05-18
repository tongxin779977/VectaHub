import type { 
  SecurityEvaluator, 
  CommandIntention, 
  SecurityContext, 
  SecurityDecision,
  SecurityDecisionType,
  SecurityRiskLevel
} from '../../types/security.js';
import { createSemanticDetector } from '../../sandbox/semantic-detector.js';

/**
 * 沙箱语义评估器
 * 负责通过启发式正则和语义分析识别极高危的命令（如反弹 Shell、敏感文件窃取、删库等）
 */
export class SandboxSemanticEvaluator implements SecurityEvaluator {
  public readonly name = 'SandboxSemanticEvaluator';
  private detector = createSemanticDetector();

  /**
   * 执行评估逻辑
   */
  public async evaluate(intention: CommandIntention, context: SecurityContext): Promise<SecurityDecision> {
    const result = this.detector.detectDangerousCommand(intention.rawCommand);

    let decision: SecurityDecisionType = 'PASSED';
    let riskLevel: SecurityRiskLevel = 'none';

    if (result.detected) {
      // 映射语义检测的严重程度到决策和风险等级
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
      ruleName: 'Sandbox-Semantic-Rule',
      reason: result.reason,
      suggestion: this.getSuggestion(riskLevel)
    };
  }

  /**
   * 提供针对语义风险的原子性建议
   */
  private getSuggestion(riskLevel: SecurityRiskLevel): string | undefined {
    if (riskLevel === 'critical' || riskLevel === 'high') {
      return '检测到该命令具有高度危险特征（如尝试绕过系统限制或访问敏感资源），已根据安全策略进行拦截。';
    }
    return undefined;
  }
}
