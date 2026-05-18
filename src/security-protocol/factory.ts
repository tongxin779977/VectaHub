import type { SecurityGuard } from '../types/security.js';
import { SecurityGuardImpl } from './guard.js';
import { CommandRuleEvaluator } from './evaluators/command-rule.js';
import { SandboxSemanticEvaluator } from './evaluators/sandbox-semantic.js';
import { ProtocolRuleEvaluator } from './evaluators/protocol-rule.js';

let guardInstance: SecurityGuard | null = null;

/**
 * 创建并组装安全防线实例
 * 默认按照：静态规则 -> 语义检测 -> 正则协议库 的顺序进行评估
 */
export function createSecurityGuard(): SecurityGuard {
  const evaluators = [
    new CommandRuleEvaluator(),
    new SandboxSemanticEvaluator(),
    new ProtocolRuleEvaluator(),
  ];
  return new SecurityGuardImpl(evaluators);
}

/**
 * 获取全局唯一的 SecurityGuard 实例
 */
export function getSecurityGuard(): SecurityGuard {
  if (!guardInstance) {
    guardInstance = createSecurityGuard();
  }
  return guardInstance;
}

/**
 * 重置实例（仅供测试使用）
 */
export function resetSecurityGuard(): void {
  guardInstance = null;
}
