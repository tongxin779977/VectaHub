import { Command } from 'commander';
import { createConsoleLogger } from '../utils/logger.js';
import { createStorage } from '../workflow/storage.js';

const logger = createConsoleLogger('history');

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'COMPLETED': return '✅';
    case 'FAILED': return '❌';
    case 'ABORTED': return '⏹️';
    case 'PAUSED': return '⏸️';
    default: return '🔄';
  }
}

export const historyCmd = new Command('history')
  .description('View workflow execution history')
  .option('-l, --limit <number>', 'Limit number of entries', '20')
  .option('-w, --workflow <id>', 'Filter by workflow ID')
  .option('-s, --status <status>', 'Filter by status (COMPLETED|FAILED|ABORTED)')
  .action(async (options: { limit: string; workflow?: string; status?: string }) => {
    const storage = createStorage();
    let records = await storage.list();

    if (options.workflow) {
      records = records.filter(r => r.workflowId === options.workflow);
    }
    if (options.status) {
      records = records.filter(r => r.status === options.status!.toUpperCase());
    }

    const limit = parseInt(options.limit, 10) || 20;
    records = records.slice(0, limit);

    if (records.length === 0) {
      logger.info('No execution records found.');
      logger.info('\nRun workflows with: vectahub run <intent>');
      return;
    }

    logger.info(`\nExecution History (${records.length} records):\n`);
    logger.info(
      'Status  | Workflow          | Started              | Duration | Steps'
    );
    logger.info(
      '--------|-------------------|----------------------|----------|------'
    );

    for (const r of records) {
      const icon = statusIcon(r.status);
      const name = (r.workflowName || r.workflowId).padEnd(17).slice(0, 17);
      const time = r.startedAt.toISOString().replace('T', ' ').slice(0, 19);
      const dur = r.duration ? formatDuration(r.duration) : '-';
      const steps = `${r.steps.length}`;

      logger.info(`${icon}     | ${name} | ${time} | ${dur.padEnd(8)} | ${steps}`);
    }

    logger.info('');
  });
