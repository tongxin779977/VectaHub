import { randomUUID } from 'node:crypto';
import type {
  ValidationRule,
  RuleEvaluationResult,
  RuleEngineResult,
  ValidationRuleEngine,
  RuleAction,
} from './types.js';

const ACTION_PRIORITY: Record<RuleAction, number> = {
  block: 0,
  warn: 1,
  log: 2,
  allow: 3,
};

/**
 * 创建验证规则引擎实例
 *
 * 支持注册自定义验证规则，对输入字符串进行多规则评估，
 * 根据最高优先级动作（block > warn > log > allow）输出最终决策。
 *
 * @param initialRules - 可选的初始规则列表
 * @returns 验证规则引擎实例
 */
export function createValidationRuleEngine(initialRules?: ValidationRule[]): ValidationRuleEngine {
  const rules = new Map<string, ValidationRule>();

  if (initialRules) {
    for (const rule of initialRules) {
      rules.set(rule.id, rule);
    }
  }

  function generateId(): string {
    return `rule_${randomUUID().slice(0, 8)}`;
  }

  return {
    /**
     * 添加验证规则
     *
     * @param rule - 规则定义（若无 id 则自动生成）
     */
    addRule(rule: ValidationRule): void {
      const id = rule.id || generateId();
      rules.set(id, { ...rule, id });
    },

    /**
     * 移除指定规则
     *
     * @param id - 规则标识符
     * @returns 是否成功移除
     */
    removeRule(id: string): boolean {
      return rules.delete(id);
    },

    /**
     * 启用指定规则
     *
     * @param id - 规则标识符
     * @returns 是否成功启用（规则不存在时返回 false）
     */
    enableRule(id: string): boolean {
      const rule = rules.get(id);
      if (!rule) return false;
      rule.enabled = true;
      return true;
    },

    /**
     * 禁用指定规则
     *
     * @param id - 规则标识符
     * @returns 是否成功禁用（规则不存在时返回 false）
     */
    disableRule(id: string): boolean {
      const rule = rules.get(id);
      if (!rule) return false;
      rule.enabled = false;
      return true;
    },

    /**
     * 对输入执行所有已启用规则的评估
     *
     * 每条规则独立评估，最终动作取所有匹配规则中优先级最高的动作。
     * block > warn > log > allow。
     *
     * @param input - 待评估的输入字符串
     * @param context - 可选的上下文数据，传递给规则条件函数
     * @returns 规则引擎评估汇总
     */
    evaluate(input: string, context?: Record<string, unknown>): RuleEngineResult {
      const results: RuleEvaluationResult[] = [];
      let finalAction: RuleAction = 'allow';

      for (const rule of rules.values()) {
        if (!rule.enabled) continue;

        let matched: boolean;
        try {
          matched = rule.condition(input, context);
        } catch {
          matched = false;
        }

        const result: RuleEvaluationResult = {
          matched,
          rule,
          action: matched ? rule.action : 'allow',
          message: matched ? `${rule.name}: ${rule.description}` : '',
          matchedAt: Date.now(),
        };

        results.push(result);

        if (matched && ACTION_PRIORITY[rule.action] < ACTION_PRIORITY[finalAction]) {
          finalAction = rule.action;
        }
      }

      return {
        blocked: finalAction === 'block',
        results,
        finalAction,
        evaluatedAt: Date.now(),
      };
    },

    /**
     * 获取当前所有规则
     *
     * @returns 规则列表
     */
    getRules(): ValidationRule[] {
      return Array.from(rules.values());
    },

    /**
     * 清除所有规则
     */
    clearRules(): void {
      rules.clear();
    },
  };
}
