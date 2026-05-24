import { Command } from 'commander';
import { format } from 'node:util';
import { createDaemon } from '../daemon/index.js';
import { createDaemonClient } from '../daemon/client.js';
import { DEFAULT_DAEMON_CONFIG } from '../daemon/types.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface DaemonCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

function createDaemonCommandOutput(): DaemonCommandOutput {
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

export const daemonCmd = new Command('daemon')
  .description('Manage VectaHub AI daemon')
  .option('-s, --socket <path>', 'Socket path', DEFAULT_DAEMON_CONFIG.socketPath);

daemonCmd
  .command('start')
  .description('Start the AI daemon')
  .action(async (opts: { parent: { socket: string } }) => {
    const output = createDaemonCommandOutput();
    try {
      const daemon = createDaemon({
        config: { socketPath: opts.parent.socket },
      });
      await daemon.start();
      output.log('AI daemon started successfully');
      output.log(`Socket: ${opts.parent.socket}`);
    } catch (err) {
      throw new VectaHubError(
        `Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`,
        ErrorType.RUNTIME
      );
    }
  });

daemonCmd
  .command('stop')
  .description('Stop the AI daemon')
  .action(async (opts: { parent: { socket: string } }) => {
    const output = createDaemonCommandOutput();
    try {
      const client = createDaemonClient({ socketPath: opts.parent.socket });
      await client.connect();
      await client.sendExecute('shutdown');
      client.disconnect();
      output.log('AI daemon stopped');
    } catch (err) {
      throw new VectaHubError(
        `Failed to stop daemon: ${err instanceof Error ? err.message : String(err)}`,
        ErrorType.RUNTIME
      );
    }
  });

daemonCmd
  .command('status')
  .description('Check the AI daemon status')
  .action(async (opts: { parent: { socket: string } }) => {
    const output = createDaemonCommandOutput();
    try {
      const client = createDaemonClient({ socketPath: opts.parent.socket });
      await client.connect();
      const status = await client.sendStatus();
      client.disconnect();
      
      output.log('Daemon Status:');
      output.log(`  State: ${status.state}`);
      output.log(`  Uptime: ${Math.round(status.uptime / 1000)}s`);
      output.log(`  Active Sessions: ${status.activeSessions}`);
      output.log(`  Queued Tasks: ${status.queuedTasks}`);
      output.log(`  Processed Tasks: ${status.processedTasks}`);
    } catch (err) {
      throw new VectaHubError(
        `Daemon is not running: ${err instanceof Error ? err.message : String(err)}`,
        ErrorType.RUNTIME
      );
    }
  });
