import { Command } from 'commander';
import { format } from 'node:util';
import { createStorage } from '../workflow/storage.js';
import { listVersions, rollbackVersion } from '../workflow/versioning.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface ListCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

function createListCommandOutput(): ListCommandOutput {
  const formatMessage = (message?: unknown, optionalParams: unknown[] = []): string => {
    if (message === undefined && optionalParams.length === 0) {
      return '';
    }
    return format(message, ...optionalParams);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${formatMessage(message, optionalParams)}\n`);
    },
  };
}

function getVectaHubDir(env: IEnvironmentService): string {
  return env.getPath();
}

/**
 * 创建列表命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createListCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('list');
  const output = createListCommandOutput();
  const listCmd = new Command('list')
    .description('List saved workflows and manage versions');

  listCmd
    .action(async () => {
      const storage = createStorage({ environment: context.environment, logger: context.logger.getLogger('storage') });

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
      const env = context.environment;
      const versions = listVersions(env, getVectaHubDir(env), workflowId);
      if (versions.length === 0) {
        logger.info(`No versions found for workflow ${workflowId}`);
        return;
      }

      logger.info(`\nVersion history for ${workflowId}:\n`);
      output.log(`  ${'Version'.padEnd(10)} ${'Date'.padEnd(22)} Message`);
      output.log(`  ${'─'.repeat(10)} ${'─'.repeat(22)} ${'─'.repeat(30)}`);
      for (const v of versions) {
        output.log(
          `  ${String(v.version).padEnd(10)} ${v.createdAt.toISOString().padEnd(22)} ${v.message}`
        );
      }
      logger.info(`\nTotal: ${versions.length} version(s)`);
    });

  return listCmd;
}

/**
 * 创建回滚命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createRollbackCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('list');
  const output = createListCommandOutput();
  return new Command('rollback')
    .description('Rollback a workflow to a specific version')
    .argument('<workflowId>', 'Workflow ID')
    .argument('<version>', 'Version number (0 = latest)')
    .option('-o, --output <file>', 'Output YAML file path')
    .action((workflowId: string, versionStr: string, options: { output?: string }) => {
      const env = context.environment;
      try {
        const version = parseInt(versionStr, 10);
        const yaml = rollbackVersion(env, getVectaHubDir(env), workflowId, version);

        if (options.output) {
          env.writeFile(options.output, yaml);
          logger.info(`Rolled back to version ${version || 'latest'}, saved to ${options.output}`);
        } else {
          logger.info(`\nRolled back to version ${version || 'latest'}:\n`);
          output.log(yaml);
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
}
