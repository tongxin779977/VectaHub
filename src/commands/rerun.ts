import { Command } from 'commander';
import { createRecordManager } from '../execution/record-manager.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import type { Workflow } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { VectaHubError, ErrorType } from '../infrastructure/index.js';

const logger = getLogger('rerun');

export const rerunCmd = new Command('rerun')
  .description('Re-run a previous workflow execution')
  .argument('<executionId>', 'Execution ID to rerun')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .action(async (executionId: string, options: { mode?: string }) => {
    const recordManager = createRecordManager();
    const record = await recordManager.get(executionId);

    if (!record) {
      logger.error(`Execution ${executionId} not found.`);
      logger.info('List executions with: vectahub history');
      return;
    }

    logger.info(`\nRe-running workflow from execution ${executionId}...`);

    try {
      const engine = createWorkflowEngine();
      const workflow = await engine.getWorkflow(record.workflowId);
      if (!workflow) {
        logger.error(`Workflow ${record.workflowId} not found.`);
        return;
      }

      const workflowObj = { ...workflow } as unknown as Workflow;
      if (options.mode) {
        workflowObj.mode = options.mode as 'strict' | 'relaxed' | 'consensus';
      }

      const result = await engine.execute(workflowObj, {
        mode: options.mode as 'strict' | 'relaxed' | 'consensus',
      });

      logger.info(`\nNew execution completed: ${result.executionId}`);
      logger.info(`Status: ${result.status}`);
      logger.info(`Duration: ${result.duration ? `${result.duration}ms` : 'N/A'}`);
    } catch (error) {
      logger.error(`Re-run failed: ${(error as Error).message}`);
      throw new VectaHubError(`Re-run failed: ${(error as Error).message}`, ErrorType.RUNTIME, error);
    }
  });
