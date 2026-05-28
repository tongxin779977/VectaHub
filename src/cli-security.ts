import type { InfrastructureContext } from './infrastructure/context.js';
import { createCliOutput } from './infrastructure/cli-output.js';
import { formatErrorMessage } from './infrastructure/errors/index.js';

/** Render the security policy warning box for non-block default policies. */
export function getSecurityWarningTemplate(policy: string): string {
  const blockTag = policy === 'block' ? ' (当前)' : '';
  const allowTag = policy === 'allow' ? ' (当前)' : '';
  const passthroughTag = policy === 'passthrough' ? ' (当前)' : '';

  return `
╔══════════════════════════════════════════════════════════════╗
║  ⚠️  安全策略警告                                            ║
╠══════════════════════════════════════════════════════════════╣
║  当前命令规则默认策略: ${policy}                            
║                                                              ║
║  为了提高安全性，建议将默认策略设置为 "block"。            ║
║  这样未明确白名单的命令将被拒绝执行。                      ║
║                                                              ║
║  配置示例 (vectahub.config.yaml):                            ║
║    sandbox:                                                  ║
║      defaultPolicy: block                                    ║
║                                                              ║
║  可选策略:                                                   ║
║  - block: 默认拒绝 (推荐，最安全)${blockTag}               
║  - allow: 默认允许${allowTag}                                 
║  - passthrough: 交给危险命令检测${passthroughTag}             
╚══════════════════════════════════════════════════════════════╝
`.trim();
}

/** Display a security policy warning if the current default policy is not "block". */
export function displayPolicyWarning(ctx: InfrastructureContext): void {
  if (ctx.environment.getArgv().includes('--json')) {
    return;
  }

  try {
    const config = ctx.config.getConfig();
    const policy = config.sandbox.defaultPolicy;

    if (policy !== 'block') {
      const output = createCliOutput({ json: false });
      output.text(getSecurityWarningTemplate(policy));
      output.blank();
    }
  } catch (error) {
    throw new Error(`Security policy warning failed: ${formatErrorMessage(error, '安全策略')}`, { cause: error });
  }
}
