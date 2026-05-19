import { Command } from 'commander';
import { createConnection } from 'net';
import type { SandboxMode } from '../types/index.js';
import { audit, getCurrentSessionId, AuditEventType } from '../utils/audit.js';
import { globalEventManager } from '../utils/event-manager.js';
import { SocketServer } from '../daemon/socket-server.js';
import { getDefaultContext, VectaHubError, ErrorType } from '../infrastructure/index.js';

const ctx = getDefaultContext();

const SOCKET_PATH = ctx.environment.getPath(ctx.environment.getTmpDir(), 'vectahub.sock');
const QUEUE_DIR = ctx.environment.getPath(ctx.environment.getTmpDir(), 'vectahub');

let socketServer: SocketServer | null = null;

const handleShutdown = (signal: string) => {
  const sessionId = getCurrentSessionId();
  console.log('\n\n🛑 Shutting down...');
  audit.log({
    event: AuditEventType.CLI_COMMAND,
    timestamp: new Date().toISOString(),
    sessionId,
    module: 'Service',
    action: 'serve_shutdown',
    input: { signal },
    success: true,
  });
  if (socketServer) {
    socketServer.stop();
  }
};

export const serveCmd = new Command('serve')
  .description('Start VectaHub as a background service')
  .option('-d, --daemon', 'Run in daemon mode', false)
  .action(async (options) => {
    const sessionId = getCurrentSessionId();

    console.log('\n🚀 Starting VectaHub Service...\n');
    console.log(`Socket: ${SOCKET_PATH}`);
    console.log(`Queue:  ${QUEUE_DIR}\n`);

    audit.log({
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Service',
      action: 'serve_start',
      input: { daemon: options.daemon },
      success: true,
    });

    socketServer = new SocketServer();

    try {
      await socketServer.start();

      console.log('✅ Service running');
      console.log('\n📋 Usage:');
      console.log('  vectahub client submit "压缩图片"');
      console.log('  vectahub client status <task-id>');
      console.log('  vectahub client list');
      console.log('  vectahub client mode [STRICT|RELAXED|CONSENSUS]');
      console.log('  vectahub client config');
      console.log('  vectahub client shutdown\n');

      audit.cliOutput('serve', 'Service started on ' + SOCKET_PATH, sessionId);

      if (options.daemon) {
        console.log('Running in daemon mode. Use "vectahub client shutdown" to stop.\n');
      }
    } catch (err) {
      console.error('❌ Server error:', (err as Error).message);
      audit.log({
        event: AuditEventType.WORKFLOW_END,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Service',
        action: 'serve_error',
        output: { error: (err as Error).message },
        success: false,
        error: (err as Error).message,
      });
      throw new VectaHubError('Server error', ErrorType.RUNTIME, err);
    }

    globalEventManager.on('SIGINT', () => {
      handleShutdown('SIGINT');
      return;
    });

    globalEventManager.on('SIGTERM', () => {
      handleShutdown('SIGTERM');
      return;
    });
  });

export const clientCmd = new Command('client')
  .description('Interact with VectaHub service')
  .addCommand(new Command('submit')
    .description('Submit a task to the service')
    .argument('<input>', 'Natural language input')
    .action(async (input: string) => {
      const sessionId = getCurrentSessionId();
      audit.cliCommand('client submit', [input], sessionId);

      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'submit',
          input,
        }) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'submitted') {
          const output = `\n✅ Task submitted: ${response.taskId}\nCheck status: vectahub client status ${response.taskId}\n`;
          console.log(output);
          audit.cliOutput('client submit', output, sessionId);
        }
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        console.error(`Socket: ${SOCKET_PATH}`);
        audit.log({
          event: AuditEventType.CLI_OUTPUT,
          timestamp: new Date().toISOString(),
          sessionId,
          module: 'Service',
          action: 'client_submit',
          output: { error: 'Cannot connect to service' },
          success: false,
          error: 'Cannot connect to service',
        });
        throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
      });
    })
  )
  .addCommand(new Command('status')
    .description('Check task status')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId: string) => {
      const sessionId = getCurrentSessionId();
      audit.cliCommand('client status', [taskId], sessionId);

      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'status',
          taskId,
        }) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'status') {
          const task = response.task;
          const outputParts: string[] = [];
          outputParts.push('\n📋 Task Status');
          outputParts.push('─'.repeat(40));
          outputParts.push(`ID:     ${task.id}`);
          outputParts.push(`Input:  ${task.input}`);
          outputParts.push(`Status: ${task.status}`);
          if (task.result) outputParts.push(`\nResult:\n${task.result}`);
          if (task.error) outputParts.push(`Error:  ${task.error}`);
          outputParts.push('');

          const output = outputParts.join('\n');
          console.log(output);
          audit.cliOutput('client status', output, sessionId);
        } else {
          console.error(`❌ ${response.message}`);
        }
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
      });
    })
  )
  .addCommand(new Command('list')
    .description('List all tasks')
    .action(async () => {
      const sessionId = getCurrentSessionId();
      audit.cliCommand('client list', [], sessionId);

      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'list',
        }) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'list') {
          const outputParts: string[] = [];
          outputParts.push('\n📋 Task List');
          outputParts.push('─'.repeat(80));
          outputParts.push('ID'.padEnd(38), 'Status'.padEnd(12), 'Input');
          outputParts.push('─'.repeat(80));
          for (const task of response.tasks) {
            outputParts.push(
              task.id.padEnd(38),
              task.status.padEnd(12),
              task.input
            );
          }
          outputParts.push(`\nTotal: ${response.tasks.length} tasks\n`);

          const output = outputParts.join('\n');
          console.log(output);
          audit.cliOutput('client list', output, sessionId);
        }
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
      });
    })
  )
  .addCommand(new Command('mode')
    .description('Get or set sandbox mode')
    .argument('[mode]', 'Sandbox mode: STRICT | RELAXED | CONSENSUS')
    .action(async (mode?: string) => {
      const sessionId = getCurrentSessionId();
      audit.cliCommand('client mode', mode ? [mode] : [], sessionId);

      const socket = createConnection({ path: SOCKET_PATH }, () => {
        if (mode) {
          const upperMode = mode.toUpperCase() as SandboxMode;
          if (!['STRICT', 'RELAXED', 'CONSENSUS'].includes(upperMode)) {
            console.error('❌ Invalid mode. Use: STRICT | RELAXED | CONSENSUS');
            socket.end();
            throw new VectaHubError('Invalid mode', ErrorType.CONFIGURATION);
          }
          socket.write(JSON.stringify({
            type: 'setMode',
            mode: upperMode,
          }) + '\n');
        } else {
          socket.write(JSON.stringify({
            type: 'getMode',
          }) + '\n');
        }
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'mode' || response.type === 'modeChanged') {
          const output = `\n🔒 Sandbox Mode: ${response.mode}\n`;
          console.log(output);
          audit.cliOutput('client mode', output, sessionId);
        }
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
      });
    })
  )
  .addCommand(new Command('config')
    .description('Get sandbox configuration')
    .action(async () => {
      const sessionId = getCurrentSessionId();
      audit.cliCommand('client config', [], sessionId);

      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'getConfig',
        }) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'config') {
          const outputParts: string[] = [];
          outputParts.push('\n⚙️ Sandbox Configuration');
          outputParts.push('─'.repeat(40));
          outputParts.push(JSON.stringify(response.config, null, 2));
          outputParts.push('');

          const output = outputParts.join('\n');
          console.log(output);
          audit.cliOutput('client config', output, sessionId);
        }
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
      });
    })
  )
  .addCommand(new Command('shutdown')
    .description('Shutdown the service')
    .action(async () => {
      const sessionId = getCurrentSessionId();
      audit.cliCommand('client shutdown', [], sessionId);

      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'shutdown',
        }) + '\n');
      });

      socket.on('data', () => {
        const output = '\n🛑 Service shutting down...\n';
        console.log(output);
        audit.cliOutput('client shutdown', output, sessionId);
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
      });
    })
  );