/**
 * 安全决策结果类型
 */
export type SecurityDecisionType = 'PASSED' | 'BLOCKED' | 'REQUIRES_CONFIRMATION' | 'REDACTED';

/**
 * 安全风险等级
 */
export type SecurityRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * 命令意图，描述一个待评估的执行动作
 */
export interface CommandIntention {
  /** 原始命令字符串 */
  rawCommand: string;
  /** 执行该命令的工具名称（如有） */
  tool?: string;
  /** 命令参数列表 */
  args?: string[];
  /** 命令执行的环境变量补丁 */
  envPatch?: Record<string, string>;
}

/**
 * 安全评估上下文，提供决策所需的元数据
 */
export interface SecurityContext {
  /** 当前工作目录 */
  cwd: string;
  /** 当前会话 ID */
  sessionId: string;
  /** 关联的任务 ID */
  taskId?: string;
  /** 是否处于预览/干跑模式 */
  isDryRun?: boolean;
  /** 用户身份信息（预留） */
  userId?: string;
}

/**
 * 安全评估结果
 */
export interface SecurityDecision {
  /** 决策结论 */
  decision: SecurityDecisionType;
  /** 风险等级 */
  riskLevel: SecurityRiskLevel;
  /** 命中的规则名称 */
  ruleName?: string;
  /** 拒绝或建议的原因 */
  reason?: string;
  /** 修复或规避建议 */
  suggestion?: string;
}

/**
 * 安全评估器接口
 * 每一个评估器负责一个原子维度的检测逻辑
 */
export interface SecurityEvaluator {
  /** 评估器唯一名称 */
  readonly name: string;
  
  /**
   * 执行安全评估
   * @param intention 待执行的命令意图
   * @param context 评估上下文
   */
  evaluate(intention: CommandIntention, context: SecurityContext): Promise<SecurityDecision>;
}

/**
 * 安全防线接口（门面模式）
 * 对外暴露的统一安全入口
 */
export interface SecurityGuard {
  /**
   * 综合评估一个命令的风险并给出决策
   * @param intention 待执行的命令意图
   * @param context 评估上下文
   */
  assess(intention: CommandIntention, context: SecurityContext): Promise<SecurityDecision>;
  
  /**
   * 脱敏输出内容，防止敏感信息泄漏
   * @param rawOutput 原始输出内容
   * @param context 评估上下文
   */
  redactOutput(rawOutput: string, context: SecurityContext): string;
}
