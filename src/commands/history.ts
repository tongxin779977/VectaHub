import { Command } from 'commander';
import { createRecordManager } from '../execution/record-manager.js';
import { createStorage } from '../workflow/storage.js';
import type { InfrastructureContext } from '../infrastructure/context.js';

function formatStatus(status: string): string {
  switch (status) {
    case 'COMPLETED': return `✅ ${status}`;
    case 'FAILED': return `❌ ${status}`;
    case 'ABORTED': return `⏹️ ${status}`;
    case 'PAUSED': return `⏸️ ${status}`;
    case 'RUNNING': return `🔄 ${status}`;
    default: return `🔶 ${status}`;
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
interface ExtendedStepRecord {
  stepId: string;
  stepName?: string;
  status: string;
  startedAt?: string | Date;
  duration?: number;
  output?: unknown;
  outputSummary?: string;
  error?: string;
  command?: string;
}

interface ExtendedExecutionRecord {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: string | Date;
  duration?: number;
  steps: ExtendedStepRecord[];
  metadata?: Record<string, unknown>;
  error?: string;
}

export function createHistoryCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('history');
  return new Command('history')
    .description('List execution history with search capabilities')
    .option('--status <status>', 'Filter by status (COMPLETED|FAILED|PAUSED|ABORTED)')
    .option('--query <text>', 'Full-text search across executions')
    .option('--limit <number>', 'Maximum records to show', '20')
    .option('--verbose', 'Show detailed information including step summaries')
    .option('--workflow <id>', 'Filter by workflow ID')
    .action(async (options: { status?: string; query?: string; limit: string; verbose?: boolean; workflow?: string }) => {
      const storage = createStorage({ environment: context.environment, logger: context.logger.getLogger('storage') });
      const recordManager = createRecordManager();
      const limit = parseInt(options.limit, 10) || 20;

      let records: ExtendedExecutionRecord[];

      if (options.query) {
        const result = await recordManager.search(options.query, {
          limit,
          status: options.status,
        });
        records = result.records as unknown as ExtendedExecutionRecord[];

        logger.info('');
        logger.info(`Search results for "${options.query}" (${result.total} total, showing ${records.length}):`);
        if (result.hasMore) {
          logger.info('Use --limit to see more results.');
        }
      } else {
        const rawRecords = await storage.list();
        records = rawRecords as unknown as ExtendedExecutionRecord[];

        if (options.status) {
          records = records.filter(r => String(r.status) === options.status!.toUpperCase());
        }
        if (options.workflow) {
          records = records.filter(r => r.workflowId === options.workflow);
        }
        records = records.slice(0, limit);
      }

      if (records.length === 0) {
        logger.info('No executions found.');
        return;
      }

      logger.info('');
      logger.info(`Execution History (${records.length} record${records.length > 1 ? 's' : ''}):`);
      logger.info('-'.repeat(80));

      for (const record of records) {
        const duration = record.duration ? formatDuration(record.duration) : 'N/A';
        const stepCount = record.steps ? record.steps.length : 0;
        const metadata = record.metadata;
        const source = metadata?.source ? ` [${metadata.source}]` : '';

        if (options.verbose) {
          logger.info('');
          logger.info(`  ${record.executionId}`);
          logger.info(`  Workflow:  ${record.workflowName || record.workflowId}`);
          logger.info(`  Status:    ${formatStatus(record.status)}`);
          logger.info(`  Duration:  ${duration}`);
          logger.info(`  Steps:     ${stepCount}`);
          logger.info(`  Started:   ${record.startedAt ? String(record.startedAt) : 'N/A'}`);
          if (source) logger.info(`  Source:    ${metadata!.source}`);
          if (metadata?.cwd) logger.info(`  CWD:       ${metadata.cwd}`);

          if (record.steps && record.steps.length > 0) {
            logger.info('  Steps:');
            for (const step of record.steps.slice(0, 5)) {
              const stepStatus = step.status === 'COMPLETED' ? '✅' : step.status === 'FAILED' ? '❌' : '⏸️';
              const extendedStep = step as ExtendedStepRecord;
              const summary = extendedStep.outputSummary ? ` - ${extendedStep.outputSummary}` : '';
              logger.info(`    ${stepStatus} ${step.stepId}: ${extendedStep.command || ''}${summary}`);
            }
            if (record.steps.length > 5) {
              logger.info(`    ... and ${record.steps.length - 5} more steps`);
            }
          }

          if (record.error) {
            logger.info(`  Error:     ${record.error}`);
          }
          logger.info('');
        } else {
          logger.info(`  ${record.executionId}`);
          logger.info(`    ${formatStatus(record.status)} ${record.workflowName || record.workflowId} | ${duration} | ${stepCount} steps${source}`);
        }
      }
      logger.info('');
      logger.info('Use "vectahub detail <executionId>" for more information.');
      logger.info('Use "vectahub history --verbose" for detailed view.');
      logger.info('Use "vectahub history --query <text>" to search.');
      logger.info('');
    });
}
