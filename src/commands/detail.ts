import { Command } from 'commander';
import { createRecordManager } from '../execution/record-manager.js';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('detail');

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'COMPLETED': return '✅ COMPLETED';
    case 'FAILED': return '❌ FAILED';
    case 'ABORTED': return '⏹️ ABORTED';
    case 'PAUSED': return '⏸️ PAUSED';
    default: return `🔄 ${status}`;
  }
}

export const detailCmd = new Command('detail')
  .description('Show detailed execution information')
  .argument('<executionId>', 'Execution ID to show details for')
  .option('-s, --step <index>', 'Show specific step details (0-based index)')
  .action(async (executionId: string, options: { step?: string }) => {
    const recordManager = createRecordManager();
    const record = await recordManager.get(executionId);

    if (!record) {
      logger.error(`Execution ${executionId} not found.`);
      logger.info('List executions with: vectahub history');
      return;
    }

    logger.info('');
    logger.info(`Execution Details: ${record.executionId}`);
    logger.info('='.repeat(60));
    logger.info(`Workflow:     ${record.workflowName || record.workflowId}`);
    logger.info(`Status:       ${statusBadge(record.status)}`);
    logger.info(`Started:      ${record.startedAt}`);
    if (record.finishedAt) {
      logger.info(`Finished:     ${record.finishedAt}`);
    }
    if (record.duration) {
      logger.info(`Duration:     ${formatDuration(record.duration)}`);
    }
    if (record.triggeredBy) {
      logger.info(`Triggered By: ${record.triggeredBy}`);
    }
    if (record.metadata?.source) {
      logger.info(`Source:       ${record.metadata.source}`);
    }
    logger.info('');
    logger.info(`Steps (${record.steps.length}):`);
    logger.info('-'.repeat(60));

    const stepIndex = options.step !== undefined ? parseInt(options.step, 10) : undefined;
    if (stepIndex !== undefined) {
      if (stepIndex < 0 || stepIndex >= record.steps.length) {
        logger.error(`Step index ${stepIndex} out of range (0-${record.steps.length - 1}).`);
        return;
      }
      const step = record.steps[stepIndex];
      logger.info(`Step #${stepIndex}: ${step.stepName || step.stepId}`);
      logger.info(`  Command:  ${step.command}`);
      logger.info(`  Status:   ${statusBadge(step.status)}`);
      if (step.startedAt) logger.info(`  Started:  ${step.startedAt}`);
      if (step.finishedAt) logger.info(`  Finished: ${step.finishedAt}`);
      if (step.duration !== undefined) logger.info(`  Duration: ${formatDuration(step.duration)}`);
      if (step.exitCode !== undefined) logger.info(`  ExitCode: ${step.exitCode}`);
      if (step.output) logger.info(`  Output:   ${step.output.slice(0, 500)}${step.output.length > 500 ? '...' : ''}`);
      if (step.error) logger.info(`  Error:    ${step.error}`);
    } else {
      for (let i = 0; i < record.steps.length; i++) {
        const step = record.steps[i];
        const icon = step.status === 'COMPLETED' ? '✅' : step.status === 'FAILED' ? '❌' : '⏸️';
        const dur = step.duration ? ` (${formatDuration(step.duration)})` : '';
        logger.info(`  ${i}. ${icon} ${step.stepName || step.stepId}${dur}`);
      }
    }

    if (record.error) {
      logger.info('');
      logger.info(`Error: ${record.error}`);
    }
    logger.info('');
  });
