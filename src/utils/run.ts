import { Command } from 'commander';
import { createLogger } from './logger.js';
import { createNLParser } from '../nl/parser.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import type { Workflow } from '../types/index.js';

const logger = createLogger('run');

export const runCmd = new Command('run')
  .description('Run a workflow from natural language')
  .argument('<intent...>', 'Natural language description')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .option('-s, --save', 'Save workflow after execution')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (intent: string[], options: any) => {
    const text = intent.join(' ');
    logger.info(`Parsing intent: "${text}"`);

    try {
      const parser = createNLParser();
      const parseResult = parser.parse(text);

      logger.debug(`Matched intent: ${parseResult.intent} (confidence: ${parseResult.confidence.toFixed(2)})`);

      if (parseResult.confidence < 0.5) {
        logger.warn(`Low confidence (${parseResult.confidence.toFixed(2)}), attempting to proceed anyway...`);
      }

      const workflowEngine = createWorkflowEngine();
      await workflowEngine.loadWorkflows();
      const storage = createStorage();

      const taskListResult = parser.parseToTaskList(text);
      if (taskListResult.status !== 'SUCCESS' || !taskListResult.taskList) {
        logger.error('Failed to convert intent to task list');
        logger.info('Try using a more specific command like: vectahub dev test workflow');
        process.exit(1);
      }

      const steps = taskListResult.taskList.tasks.map((task, index) => {
        const cmd = task.commands[0] || { cli: 'echo', args: [] };
        return {
          id: `step_${index + 1}`,
          type: 'exec' as const,
          cli: cmd.cli,
          args: cmd.args,
        };
      });

      const workflow = await workflowEngine.createWorkflow(
        `intent_${Date.now()}`,
        steps
      );

      logger.info(`Created workflow with ${steps.length} steps`);

      if (options.save) {
        await storage.saveWorkflow(workflow);
        logger.info('Workflow saved');
      }

      logger.info('Executing workflow...');
      const mode = options.mode || 'relaxed';
      const result = await workflowEngine.execute(workflow, { mode: mode as any });

      logger.info(`\nExecution ${result.status}`);
      logger.info(`Duration: ${result.duration}ms`);

      if (result.status === 'COMPLETED') {
        logger.info('✅ Workflow completed successfully');
      } else if (result.status === 'FAILED') {
        logger.error('❌ Workflow failed');
        const lastFailedStep = result.steps[result.steps.length - 1];
        if (lastFailedStep?.error) {
          logger.error(`Error: ${lastFailedStep.error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.debug(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    }
  });
