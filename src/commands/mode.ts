import { Command } from 'commander';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

const VALID_MODES = ['strict', 'relaxed', 'consensus'] as const;

/**
 * 创建模式命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createModeCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('mode');
  return new Command('mode')
    .description('Get or set execution mode')
    .argument('[mode]', 'Mode to set (strict|relaxed|consensus)')
    .action(async (mode?: string) => {
      if (!mode) {
        const config = context.config.getConfig();
        const current = config.sandbox.mode.toLowerCase();
        logger.info(`Current mode: ${current}`);
        logger.info(`Valid modes: ${VALID_MODES.join(', ')}`);
        return;
      }

      const normalized = mode.toLowerCase();
      if (!VALID_MODES.includes(normalized as typeof VALID_MODES[number])) {
        logger.error(`Invalid mode: ${mode}`);
        logger.info(`Valid modes: ${VALID_MODES.join(', ')}`);
        throw new VectaHubError(`Invalid mode: ${mode}`, ErrorType.RUNTIME);
      }

      const sandboxMode = normalized.toUpperCase() as 'STRICT' | 'RELAXED' | 'CONSENSUS';
      context.config.updateConfig({ sandbox: { ...context.config.getConfig().sandbox, mode: sandboxMode } });
      logger.info(`Mode set to: ${normalized}`);
    });
}
