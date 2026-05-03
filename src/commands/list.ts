import { Command } from 'commander';
import { createStorage } from '../workflow/storage.js';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('list');

export const listCmd = new Command('list')
  .description('List saved workflows')
  .action(async () => {
    const storage = createStorage();

    try {
      const workflows = await storage.listWorkflows();

      if (workflows.length === 0) {
        logger.info('No saved workflows');
        return;
      }

      logger.info('Saved workflows:');
      workflows.forEach((w: any) => {
        const date = new Date(w.createdAt).toLocaleDateString();
        logger.info(`  ${w.id}: ${w.name} (${w.steps?.length || 0} steps) - ${date}`);
      });

      logger.info(`\nTotal: ${workflows.length} workflow(s)`);
    } catch (error) {
      logger.error(`Error listing workflows: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
