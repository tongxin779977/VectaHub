import { Command } from 'commander';
import { createLogger } from './logger.js';

const logger = createLogger('mode');

let currentMode: 'strict' | 'relaxed' | 'consensus' = 'relaxed';

export const modeCmd = new Command('mode')
  .description('Get or set execution mode')
  .argument('[mode]', 'Mode to set (strict|relaxed|consensus)')
  .action(async (mode?: string) => {
    if (!mode) {
      logger.info(`Current mode: ${currentMode}`);
      return;
    }

    if (!['strict', 'relaxed', 'consensus'].includes(mode)) {
      logger.error(`Invalid mode: ${mode}`);
      logger.info('Valid modes: strict, relaxed, consensus');
      process.exit(1);
    }

    currentMode = mode as 'strict' | 'relaxed' | 'consensus';
    logger.info(`Mode set to: ${mode}`);
  });
