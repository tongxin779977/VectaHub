import { createRBACManager } from '../security-protocol/rbac.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { getCliToolRegistry, type CliToolRegistry } from '../cli-tools/index.js';
import { ShellTokenizer } from '../utils/shell-tokenizer.js';
import type { ExecutorOptions, CLIResult } from './executor.js';
import type { Step } from '../types/index.js';

/**
 * PolicyManager 负责命令执行前的各类策略检查：
 * 1. RBAC 权限校验
 * 2. 自动化凭证预检 (Pre-flight Checks)
 * 3. 安全沙箱判定 (部分逻辑在 executor 中，这里处理分层)
 */
export class PolicyManager {
  private rbac: ReturnType<typeof createRBACManager>;
  private _toolRegistry?: CliToolRegistry;
  private auditHelper: AuditHelper;

  constructor(auditHelper: AuditHelper, environment: IEnvironmentService) {
    this.auditHelper = auditHelper;
    this.rbac = createRBACManager({ environment });
  }

  private get toolRegistry() {
    if (!this._toolRegistry) {
      this._toolRegistry = getCliToolRegistry();
    }
    return this._toolRegistry;
  }

  /**
   * 检查角色是否有权执行特定命令
   */
  checkRBAC(cli: string, args: string[], options: ExecutorOptions): { allowed: boolean; error?: string } {
    if (!options.role) return { allowed: true };

    const fullCommand = `${cli} ${args.join(' ')}`;
    if (!this.rbac.canExecute(options.role, fullCommand, cli)) {
      const sessionId = options.sessionId || 'unknown';
      this.auditHelper.securityAction('RBAC_DENIED', fullCommand, `Role ${options.role} blocked command`, sessionId);
      return {
        allowed: false,
        error: `Command denied by RBAC: role "${options.role}" cannot execute "${cli}"`,
      };
    }

    return { allowed: true };
  }

  /**
   * 执行工具的凭证预检
   */
  async runPreFlightCheck(
    steps: Step[],
    execFn: (cli: string, args: string[], options: ExecutorOptions) => Promise<CLIResult>,
    options: ExecutorOptions
  ): Promise<{ success: boolean; error?: string }> {
    if (options.dryRun) return { success: true };

    const toolsToCheck = new Set<string>();
    for (const step of steps) {
      if (step.cli) toolsToCheck.add(step.cli);
    }

    for (const toolName of toolsToCheck) {
      const tool = this.toolRegistry.getTool(toolName);
      if (tool?.authCheckCommand) {
        const tokens = ShellTokenizer.tokenize(tool.authCheckCommand);
        if (tokens.length > 0) {
          const checkResult = await execFn(tokens[0].cli, tokens[0].args, {
            ...options,
            timeout: 10000,
          });
          if (!checkResult.success) {
            return {
              success: false,
              error: tool.authHelpMessage || `检测到工具 ${toolName} 未通过凭证预检。`,
            };
          }
        }
      }
    }

    return { success: true };
  }
}
