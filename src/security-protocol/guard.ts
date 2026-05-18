import type { 
  SecurityGuard, 
  SecurityEvaluator, 
  CommandIntention, 
  SecurityContext, 
  SecurityDecision,
  SecurityDecisionType,
  SecurityRiskLevel
} from '../types/security.js';
import { createRedactor, Redactor } from './redactor.js';

/**
 * 安全防线接口的默认实现（管道模式）
 * 按顺序执行多个评估器，并综合得出最终的安全决策。
 */
export class SecurityGuardImpl implements SecurityGuard {
  private evaluators: SecurityEvaluator[] = [];
  private redactor: Redactor;

  constructor(evaluators: SecurityEvaluator[]) {
    this.evaluators = evaluators;
    this.redactor = createRedactor();
  }

  /**
   * 综合评估命令风险
   * 遵循“熔断”原则：只要有一个评估器阻断，则整体决策为阻断。
   * 同时收集所有评估器中最高级别的风险警告。
   */
  public async assess(intention: CommandIntention, context: SecurityContext): Promise<SecurityDecision> {
    let finalDecision: SecurityDecisionType = 'PASSED';
    let maxRiskLevel: SecurityRiskLevel = 'none';
    let triggeredRule: string | undefined;
    let reason: string | undefined;
    let suggestion: string | undefined;

    const riskOrder: SecurityRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];

    for (const evaluator of this.evaluators) {
      const result = await evaluator.evaluate(intention, context);

      // 如果任意评估器决定阻断，则立即停止后续评估（熔断）
      if (result.decision === 'BLOCKED') {
        return {
          ...result,
          suggestion: result.suggestion || this.getDefaultSuggestion(result.riskLevel),
        };
      }

      // 综合决策优先级：REQUIRES_CONFIRMATION > REDACTED > PASSED
      if (result.decision === 'REQUIRES_CONFIRMATION') {
        finalDecision = 'REQUIRES_CONFIRMATION';
      } else if (result.decision === 'REDACTED' && finalDecision === 'PASSED') {
        finalDecision = 'REDACTED';
      }

      // 更新最高风险等级及其相关上下文信息
      if (riskOrder.indexOf(result.riskLevel) > riskOrder.indexOf(maxRiskLevel)) {
        maxRiskLevel = result.riskLevel;
        triggeredRule = result.ruleName;
        reason = result.reason;
        suggestion = result.suggestion || this.getDefaultSuggestion(result.riskLevel);
      }
    }

    return {
      decision: finalDecision,
      riskLevel: maxRiskLevel,
      ruleName: triggeredRule,
      reason,
      suggestion,
    };
  }

  /**
   * 提供默认的安全改进建议
   */
  private getDefaultSuggestion(riskLevel: SecurityRiskLevel): string | undefined {
    switch (riskLevel) {
      case 'critical':
        return '此命令已被安全策略阻断，无法执行。';
      case 'high':
        return '此命令被评估为高风险，需要人工确认后方可继续。';
      case 'medium':
        return '此命令具有中等风险，请确保您了解该操作的影响。';
      default:
        return undefined;
    }
  }

  /**
   * 脱敏输出内容
   */
  public redactOutput(rawOutput: string, _context: SecurityContext): string {
    return this.redactor.redact(rawOutput);
  }
}
