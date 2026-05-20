import { Command } from 'commander';
import { getDefaultContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

const ctx = getDefaultContext();
const logger = ctx.logger.getLogger('mode');
const VALID_MODES = ['strict', 'relaxed', 'consensus'] as const;

function loadCurrentMode(): string {
  const config = ctx.config.getConfig();
  return config.sandbox.mode.toLowerCase();
}

export const modeCmd = new Command('mode')
  .description('Get or set execution mode')
  .argument('[mode]', 'Mode to set (strict|relaxed|consensus)')
  .action(async (mode?: string) => {
    if (!mode) {
      const current = loadCurrentMode();
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
    ctx.config.updateConfig({ sandbox: { ...ctx.config.getConfig().sandbox, mode: sandboxMode } });
    logger.info(`Mode set to: ${normalized}`);
  });
