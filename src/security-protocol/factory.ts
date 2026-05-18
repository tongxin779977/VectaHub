import type { SecurityGuard, SecurityEvaluator } from '../types/security.js';
import { SecurityGuardImpl } from './guard.js';
import { CommandRuleEvaluator } from './evaluators/command-rule.js';
import { SandboxSemanticEvaluator } from './evaluators/sandbox-semantic.js';
import { ProtocolRuleEvaluator } from './evaluators/protocol-rule.js';

/**
 * SecurityGuard 依赖注入接口
 * 用于支持自定义替换评估器链
 */
export interface SecurityGuardDeps {
  evaluators?: SecurityEvaluator[];
}

let guardInstance: SecurityGuard | null = null;

/**
 * 创建并组装安全防线实例
 * 默认按照：静态规则 -> 语义检测 -> 正则协议库 的顺序进行评估
 * @param deps 可选的依赖注入参数
 */
export function createSecurityGuard(deps: SecurityGuardDeps = {}): SecurityGuard {
  const evaluators = deps.evaluators ?? [
    new CommandRuleEvaluator(),
    new SandboxSemanticEvaluator(),
    new ProtocolRuleEvaluator(),
  ];
  return new SecurityGuardImpl(evaluators);
}

/**
 * 获取全局唯一的 SecurityGuard 实例
 * @deprecated 使用 createSecurityGuard() 代替，支持依赖注入
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
