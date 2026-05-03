import { Command } from 'commander';
import { createScheduleManager } from '../workflow/scheduler.js';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('schedule');

export const scheduleCmd = new Command('schedule')
  .description('Manage scheduled tasks')
  .option('-n, --name <name>', 'Schedule name')
  .option('-c, --cron <cron>', 'Cron expression')
  .option('-w, --workflow-file <file>', 'Workflow file path')
  .option('-e, --command <command>', 'Command to execute')
  .option('-a, --args <args>', 'Command arguments (comma separated)', (v) => v.split(','))
  .option('--id <id>', 'Schedule ID');

scheduleCmd
  .command('add')
  .description('Add a new scheduled task')
  .requiredOption('-n, --name <name>', 'Schedule name')
  .requiredOption('-c, --cron <cron>', 'Cron expression')
  .option('-w, --workflow-file <file>', 'Workflow file path')
  .option('-e, --command <command>', 'Command to execute')
  .option('-a, --args <args>', 'Command arguments (comma separated)', (v) => v.split(','))
  .action((opts) => {
    const manager = createScheduleManager();
    const entry = manager.add({
      name: opts.name,
      cron: opts.cron,
      workflowFile: opts.workflowFile,
      command: opts.command,
      args: opts.args,
    });
    logger.info(`Schedule added: ${entry.name} (${entry.id}) - cron: ${entry.cron}`);
    logger.info(`  Workflow: ${entry.workflowFile || 'N/A'}`);
    logger.info(`  Command: ${entry.command || 'N/A'}`);
  });

scheduleCmd
  .command('remove')
  .description('Remove a scheduled task')
  .requiredOption('--id <id>', 'Schedule ID')
  .action((opts) => {
    const manager = createScheduleManager();
    const removed = manager.remove(opts.id);
    if (removed) {
      logger.info(`Schedule removed: ${opts.id}`);
    } else {
      logger.error(`Schedule not found: ${opts.id}`);
      process.exit(1);
    }
  });

scheduleCmd
  .command('list')
  .description('List all scheduled tasks')
  .action(() => {
    const manager = createScheduleManager();
    const schedules = manager.list();
    
    if (schedules.length === 0) {
      logger.info('No scheduled tasks');
      return;
    }

    logger.info(`\n${'Name'.padEnd(25)} | ${'Cron'.padEnd(15)} | ${'Status'.padEnd(10)} | ${'Runs'.padEnd(5)} | Last Run`);
    logger.info('─'.repeat(90));

    for (const s of schedules) {
      const status = s.lastStatus || 'PENDING';
      const runs = String(s.runCount || 0);
      const lastRun = s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never';
      const enabled = s.enabled ? 'ENABLED' : 'DISABLED';
      logger.info(`${s.name.padEnd(25)} | ${s.cron.padEnd(15)} | ${enabled.padEnd(10)} | ${runs.padEnd(5)} | ${lastRun}`);
      if (s.lastError) {
        logger.info(`  Error: ${s.lastError}`);
      }
    }
    logger.info('');
  });
