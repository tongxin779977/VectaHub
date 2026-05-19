import { Command } from 'commander';
import { createDaemon } from '../daemon/index.js';
import { createDaemonClient } from '../daemon/client.js';
import { DaemonState } from '../daemon/types.js';
import { DEFAULT_DAEMON_CONFIG } from '../daemon/types.js';
import { VectaHubError, ErrorType } from '../infrastructure/index.js';

export const daemonCmd = new Command('daemon')
  .description('Manage VectaHub AI daemon')
  .option('-s, --socket <path>', 'Socket path', DEFAULT_DAEMON_CONFIG.socketPath);

daemonCmd
  .command('start')
  .description('Start the AI daemon')
  .action(async (opts: { parent: { socket: string } }) => {
    try {
      const daemon = createDaemon({
        config: { socketPath: opts.parent.socket },
      });
      await daemon.start();
      console.log('AI daemon started successfully');
      console.log(`Socket: ${opts.parent.socket}`);
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
    try {
      const client = createDaemonClient({ socketPath: opts.parent.socket });
      await client.connect();
      await client.sendExecute('shutdown');
      client.disconnect();
      console.log('AI daemon stopped');
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
    try {
      const client = createDaemonClient({ socketPath: opts.parent.socket });
      await client.connect();
      const status = await client.sendStatus();
      client.disconnect();
      
      console.log('Daemon Status:');
      console.log(`  State: ${status.state}`);
      console.log(`  Uptime: ${Math.round(status.uptime / 1000)}s`);
      console.log(`  Active Sessions: ${status.activeSessions}`);
      console.log(`  Queued Tasks: ${status.queuedTasks}`);
      console.log(`  Processed Tasks: ${status.processedTasks}`);
    } catch (err) {
      throw new VectaHubError(
        `Daemon is not running: ${err instanceof Error ? err.message : String(err)}`,
        ErrorType.RUNTIME
      );
    }
  });
