import { Command } from 'commander';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('history');

export const historyCmd = new Command('history')
  .description('View workflow execution history')
  .option('-l, --limit <number>', 'Limit number of entries', '20')
  .action(async (options: any) => {
    logger.info('Recent execution history:\n');
    logger.info('(No execution records found - history feature is under development)');
    logger.info(`\nTo view history, run workflows with: vectahub run <intent>`);
  });
