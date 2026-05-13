import { Command } from 'commander';
import { createRecordManager } from '../execution/record-manager.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('resume');

export const resumeCmd = new Command('resume')
  .description('Resume a failed or paused workflow execution')
  .argument('<executionId>', 'Execution ID to resume')
  .option('--from-step <index>', 'Resume from specific step index (0-based)')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .action(async (executionId: string, options: { fromStep?: string; mode?: string }) => {
    const recordManager = createRecordManager();
    const record = await recordManager.get(executionId);

    if (!record) {
      logger.error(`Execution ${executionId} not found.`);
      logger.info('List executions with: vectahub history');
      return;
    }

    const failedIdx = record.steps.findIndex((s) => s.status === 'FAILED');
    if (failedIdx === -1 && record.status !== 'PAUSED') {
      logger.error(`Execution ${executionId} has no failed or paused step to resume from.`);
      logger.info(`Current status: ${record.status}`);
      return;
    }

    const targetStep = options.fromStep !== undefined
      ? parseInt(options.fromStep, 10)
      : failedIdx;

    logger.info(`\nResuming execution from step #${targetStep}...`);

    try {
      const engine = createWorkflowEngine();
      const result = await engine.resumeFromFailure(executionId, targetStep, {
        mode: options.mode as 'strict' | 'relaxed' | 'consensus',
      });

      logger.info(`\nResumed execution completed: ${result.executionId}`);
      logger.info(`Status: ${result.status}`);
      logger.info(`Duration: ${result.duration ? `${result.duration}ms` : 'N/A'}`);
    } catch (error) {
      logger.error(`Resume failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });
