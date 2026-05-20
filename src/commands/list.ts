import { Command } from 'commander';
import { getVectaHubPath } from '../infrastructure/paths/index.js';
import { createStorage } from '../workflow/storage.js';
import { listVersions, rollbackVersion } from '../workflow/versioning.js';
import { getDefaultContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

const logger = getDefaultContext().logger.getLogger('list');

function getVectaHubDir(): string {
  return getVectaHubPath();
}

export const listCmd = new Command('list')
  .description('List saved workflows and manage versions');

listCmd
  .action(async () => {
    const storage = createStorage({ environment: getDefaultContext().environment });

    try {
      const workflows = await storage.listWorkflows();

      if (workflows.length === 0) {
        logger.info('No saved workflows');
        return;
      }

      logger.info('Saved workflows:');
      workflows.forEach((w) => {
        const date = new Date(w.createdAt).toLocaleDateString();
        logger.info(`  ${w.id}: ${w.name} (${w.steps?.length || 0} steps) - ${date}`);
      });

      logger.info(`\nTotal: ${workflows.length} workflow(s)`);
    } catch (error) {
      logger.error(`Error listing workflows: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new VectaHubError(
        `Error listing workflows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.RUNTIME,
        error
      );
    }
  });

listCmd
  .command('versions')
  .description('List version history of a workflow')
  .argument('<workflowId>', 'Workflow ID')
  .action((workflowId: string) => {
    const env = getDefaultContext().environment;
    const versions = listVersions(env, getVectaHubDir(), workflowId);
    if (versions.length === 0) {
      logger.info(`No versions found for workflow ${workflowId}`);
      return;
    }

    logger.info(`\nVersion history for ${workflowId}:\n`);
    console.log(`  ${'Version'.padEnd(10)} ${'Date'.padEnd(22)} Message`);
    console.log(`  ${'─'.repeat(10)} ${'─'.repeat(22)} ${'─'.repeat(30)}`);
    for (const v of versions) {
      console.log(
        `  ${String(v.version).padEnd(10)} ${v.createdAt.toISOString().padEnd(22)} ${v.message}`
      );
    }
    logger.info(`\nTotal: ${versions.length} version(s)`);
  });

export const rollbackCmd = new Command('rollback')
  .description('Rollback a workflow to a specific version')
  .argument('<workflowId>', 'Workflow ID')
  .argument('<version>', 'Version number (0 = latest)')
  .option('-o, --output <file>', 'Output YAML file path')
  .action((workflowId: string, versionStr: string, options: { output?: string }) => {
    const env = getDefaultContext().environment;
    try {
      const version = parseInt(versionStr, 10);
      const yaml = rollbackVersion(env, getVectaHubDir(), workflowId, version);

      if (options.output) {
        env.writeFile(options.output, yaml);
        logger.info(`Rolled back to version ${version || 'latest'}, saved to ${options.output}`);
      } else {
        logger.info(`\nRolled back to version ${version || 'latest'}:\n`);
        console.log(yaml);
      }
    } catch (error) {
      logger.error(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new VectaHubError(
        `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.RUNTIME,
        error
      );
    }
  });
