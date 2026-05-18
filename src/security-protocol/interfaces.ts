/**
 * Security Protocol 模块接口定义
 * 遵循 Interface-first 原则，不包含实现代码
 * 
 * 本文件主要从 `types/security.ts 中导出已定义的接口
 */

export type {
  SecurityDecisionType,
  SecurityRiskLevel,
  CommandIntention,
  SecurityContext,
  SecurityDecision,
  SecurityEvaluator,
  SecurityGuard
} from '../types/security.js';
