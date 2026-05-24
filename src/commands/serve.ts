import { Command } from 'commander';
import { createConnection } from 'net';
import { format } from 'node:util';
import type { SandboxMode } from '../types/index.js';
import { AuditEventType } from '../infrastructure/audit/index.js';
import { SocketServer } from '../daemon/socket-server.js';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { createLLMConfig } from '../nl/llm.js';

let socketServer: SocketServer | null = null;

interface ServeCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

function createServeCommandOutput(): ServeCommandOutput {
  const writeLine = (stream: NodeJS.WriteStream, message?: unknown, optionalParams: unknown[] = []): void => {
    stream.write(`${format(message, ...optionalParams)}\n`);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stdout, message, optionalParams);
    },
    warn(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
    error(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
  };
}

export function createServeCommands(context: InfrastructureContext): { serveCmd: Command; clientCmd: Command } {
  const socketPath = context.environment.getPath(context.environment.getTmpDir(), 'vectahub.sock');
  const queueDir = context.environment.getPath(context.environment.getTmpDir(), 'vectahub');
  const outputWriter = createServeCommandOutput();

  const getAuditHelper = () => context.audit.getHelper();
  const getCurrentSessionId = () => context.audit.getLogger().getSessionId();

  const handleShutdown = (signal: string) => {
    const sessionId = getCurrentSessionId();
    outputWriter.log('\n\n🛑 Shutting down...');
    getAuditHelper().log({
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

  const serveCmd = new Command('serve')
    .description('Start VectaHub as a background service')
    .option('-d, --daemon', 'Run in daemon mode', false)
    .action(async (options) => {
      const sessionId = getCurrentSessionId();

      outputWriter.log('\n🚀 Starting VectaHub Service...\n');
      outputWriter.log(`Socket: ${socketPath}`);
      outputWriter.log(`Queue:  ${queueDir}\n`);

      getAuditHelper().log({
        event: AuditEventType.CLI_COMMAND,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Service',
        action: 'serve_start',
        input: { daemon: options.daemon },
        success: true,
      });

      socketServer = new SocketServer({}, {
        auditHelper: context.audit.getHelper(),
        logger: context.logger.getLogger('nl-pipeline'),
        getSessionId: () => context.audit.getLogger().getSessionId(),
        llmConfigProvider: () => createLLMConfig(),
      });

      try {
        await socketServer.start();

        outputWriter.log('✅ Service running');
        outputWriter.log('\n📋 Usage:');
        outputWriter.log('  vectahub client submit "压缩图片"');
        outputWriter.log('  vectahub client status <task-id>');
        outputWriter.log('  vectahub client list');
        outputWriter.log('  vectahub client mode [STRICT|RELAXED|CONSENSUS]');
        outputWriter.log('  vectahub client config');
        outputWriter.log('  vectahub client shutdown\n');

        getAuditHelper().cliOutput('serve', 'Service started on ' + socketPath, sessionId);

        if (options.daemon) {
          outputWriter.log('Running in daemon mode. Use "vectahub client shutdown" to stop.\n');
        }
      } catch (err) {
        outputWriter.error('❌ Server error:', (err as Error).message);
        getAuditHelper().log({
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

      context.eventBus.on('SIGINT', () => {
        handleShutdown('SIGINT');
        return;
      });

      context.eventBus.on('SIGTERM', () => {
        handleShutdown('SIGTERM');
        return;
      });
    });

  const clientCmd = new Command('client')
    .description('Interact with VectaHub service')
    .addCommand(new Command('submit')
      .description('Submit a task to the service')
      .argument('<input>', 'Natural language input')
      .action(async (input: string) => {
        const sessionId = getCurrentSessionId();
        getAuditHelper().cliCommand('client submit', [input], sessionId);

        const socket = createConnection({ path: socketPath }, () => {
          socket.write(JSON.stringify({
            type: 'submit',
            input,
          }) + '\n');
        });

        socket.on('data', (data) => {
          const response = JSON.parse(data.toString());
          if (response.type === 'submitted') {
            const output = `\n✅ Task submitted: ${response.taskId}\nCheck status: vectahub client status ${response.taskId}\n`;
            outputWriter.log(output);
            getAuditHelper().cliOutput('client submit', output, sessionId);
          }
          socket.end();
        });

        socket.on('error', () => {
          outputWriter.error('❌ Cannot connect to service. Is it running?');
          outputWriter.error(`Socket: ${socketPath}`);
          getAuditHelper().log({
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
        getAuditHelper().cliCommand('client status', [taskId], sessionId);

        const socket = createConnection({ path: socketPath }, () => {
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
            outputWriter.log(output);
            getAuditHelper().cliOutput('client status', output, sessionId);
          } else {
            outputWriter.error(`❌ ${response.message}`);
          }
          socket.end();
        });

        socket.on('error', () => {
          outputWriter.error('❌ Cannot connect to service. Is it running?');
          throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
        });
      })
    )
    .addCommand(new Command('list')
      .description('List all tasks')
      .action(async () => {
        const sessionId = getCurrentSessionId();
        getAuditHelper().cliCommand('client list', [], sessionId);

        const socket = createConnection({ path: socketPath }, () => {
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
            outputWriter.log(output);
            getAuditHelper().cliOutput('client list', output, sessionId);
          }
          socket.end();
        });

        socket.on('error', () => {
          outputWriter.error('❌ Cannot connect to service. Is it running?');
          throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
        });
      })
    )
    .addCommand(new Command('mode')
      .description('Get or set sandbox mode')
      .argument('[mode]', 'Sandbox mode: STRICT | RELAXED | CONSENSUS')
      .action(async (mode?: string) => {
        const sessionId = getCurrentSessionId();
        getAuditHelper().cliCommand('client mode', mode ? [mode] : [], sessionId);

        const socket = createConnection({ path: socketPath }, () => {
          if (mode) {
            const upperMode = mode.toUpperCase() as SandboxMode;
            if (!['STRICT', 'RELAXED', 'CONSENSUS'].includes(upperMode)) {
              outputWriter.error('❌ Invalid mode. Use: STRICT | RELAXED | CONSENSUS');
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
            outputWriter.log(output);
            getAuditHelper().cliOutput('client mode', output, sessionId);
          }
          socket.end();
        });

        socket.on('error', () => {
          outputWriter.error('❌ Cannot connect to service. Is it running?');
          throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
        });
      })
    )
    .addCommand(new Command('config')
      .description('Get sandbox configuration')
      .action(async () => {
        const sessionId = getCurrentSessionId();
        getAuditHelper().cliCommand('client config', [], sessionId);

        const socket = createConnection({ path: socketPath }, () => {
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
            outputWriter.log(output);
            getAuditHelper().cliOutput('client config', output, sessionId);
          }
          socket.end();
        });

        socket.on('error', () => {
          outputWriter.error('❌ Cannot connect to service. Is it running?');
          throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
        });
      })
    )
    .addCommand(new Command('shutdown')
      .description('Shutdown the service')
      .action(async () => {
        const sessionId = getCurrentSessionId();
        getAuditHelper().cliCommand('client shutdown', [], sessionId);

        const socket = createConnection({ path: socketPath }, () => {
          socket.write(JSON.stringify({
            type: 'shutdown',
          }) + '\n');
        });

        socket.on('data', () => {
          const output = '\n🛑 Service shutting down...\n';
          outputWriter.log(output);
          getAuditHelper().cliOutput('client shutdown', output, sessionId);
          socket.end();
        });

        socket.on('error', () => {
          outputWriter.error('❌ Cannot connect to service. Is it running?');
          throw new VectaHubError('Cannot connect to service', ErrorType.RUNTIME);
        });
      })
    );

  return { serveCmd, clientCmd };
}
