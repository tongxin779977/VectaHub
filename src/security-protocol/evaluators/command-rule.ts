import type { 
  SecurityEvaluator, 
  CommandIntention, 
  SecurityContext, 
  SecurityDecision,
  SecurityDecisionType,
  SecurityRiskLevel
} from '../../types/security.js';
import { createCommandRuleEngine, CommandRuleEngine } from '../../command-rules/engine.js';
import { 
  loadGlobalBlocklist, 
  loadGlobalAllowlist, 
  loadProjectBlocklist, 
  loadProjectAllowlist 
} from '../../command-rules/loader.js';
import type { CommandRuleLoaderDeps } from '../../command-rules/loader.js';
import { getVectaHubPath } from '../../infrastructure/paths/index.js';

/**
 * 命令规则评估器
 * 基于静态的黑名单和白名单配置（全局及项目级别）对命令进行初步筛选
 */
export class CommandRuleEvaluator implements SecurityEvaluator {
  public readonly name = 'CommandRuleEvaluator';
  private engine: CommandRuleEngine | null = null;
  private lastProjectPath: string | null = null;
  private readonly loaderDeps: CommandRuleLoaderDeps;

  constructor(loaderDeps?: CommandRuleLoaderDeps) {
    this.loaderDeps = loaderDeps ?? {
      logger: console,
      getGlobalConfigPath: () => getVectaHubPath('command-rules'),
    };
  }

  /**
   * 获取或初始化规则引擎
   * 遵循单例及按需加载原则，并支持项目路径切换时的动态重新加载
   */
  private getEngine(projectPath: string): CommandRuleEngine {
    if (this.engine && this.lastProjectPath === projectPath) {
      return this.engine;
    }

    this.engine = createCommandRuleEngine({
      globalBlocklist: loadGlobalBlocklist(this.loaderDeps),
      globalAllowlist: loadGlobalAllowlist(this.loaderDeps),
      projectBlocklist: loadProjectBlocklist(projectPath, this.loaderDeps),
      projectAllowlist: loadProjectAllowlist(projectPath, this.loaderDeps),
      defaultPolicy: 'passthrough', // 强制使用 passthrough，让后续 Evaluator 有机会执行
    });
    this.lastProjectPath = projectPath;
    return this.engine;
  }

  /**
   * 执行评估逻辑
   */
  public async evaluate(intention: CommandIntention, context: SecurityContext): Promise<SecurityDecision> {
    const engine = this.getEngine(context.cwd);
    const result = engine.evaluate(intention.rawCommand);

    let decision: SecurityDecisionType = 'PASSED';
    let riskLevel: SecurityRiskLevel = 'none';

    // 映射旧引擎的决策到新的标准契约
    switch (result.decision) {
      case 'block':
        decision = 'BLOCKED';
        riskLevel = 'critical';
        break;
      case 'allow':
        decision = 'PASSED';
        riskLevel = 'none';
        break;
      case 'passthrough':
        decision = 'PASSED'; // passthrough 表示静态规则未命中，交给后续评估器
        riskLevel = 'none';
        break;
    }

    return {
      decision,
      riskLevel,
      ruleName: result.rule?.id || result.rule?.description,
      reason: result.message,
    };
  }
}
