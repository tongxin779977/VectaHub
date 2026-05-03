import { Command } from 'commander';
import { join } from 'path';
import { homedir } from 'os';
import { writeFileSync } from 'fs';
import { createStorage } from '../workflow/storage.js';
import { createConsoleLogger } from '../utils/logger.js';
import { listVersions, rollbackVersion } from '../workflow/versioning.js';

const logger = createConsoleLogger('list');
const VECTAHUB_DIR = join(homedir(), '.vectahub');

export const listCmd = new Command('list')
  .description('List saved workflows and manage versions')
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
  })
  .command('versions')
  .description('List version history of a workflow')
  .argument('<workflowId>', 'Workflow ID')
  .action((workflowId: string) => {
    const versions = listVersions(VECTAHUB_DIR, workflowId);
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
    try {
      const version = parseInt(versionStr, 10);
      const yaml = rollbackVersion(VECTAHUB_DIR, workflowId, version);

      if (options.output) {
        writeFileSync(options.output, yaml, 'utf-8');
        logger.info(`Rolled back to version ${version || 'latest'}, saved to ${options.output}`);
      } else {
        logger.info(`\nRolled back to version ${version || 'latest'}:\n`);
        console.log(yaml);
      }
    } catch (error) {
      logger.error(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
