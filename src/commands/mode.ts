import { Command } from 'commander';
import { createConsoleLogger } from '../utils/logger.js';
import { loadConfig, updateConfig } from '../infrastructure/config/index.js';

const logger = createConsoleLogger('mode');
const VALID_MODES = ['strict', 'relaxed', 'consensus'] as const;

function loadCurrentMode(): string {
  const config = loadConfig();
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
      process.exit(1);
    }

    const sandboxMode = normalized.toUpperCase() as 'STRICT' | 'RELAXED' | 'CONSENSUS';
    updateConfig({ sandbox: { ...loadConfig().sandbox, mode: sandboxMode } });
    logger.info(`Mode set to: ${normalized}`);
  });
