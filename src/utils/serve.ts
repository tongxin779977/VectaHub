import { Command } from 'commander';
import { createServer, createConnection } from 'net';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createNLParser } from '../nl/parser.js';
import { createSandboxManager } from '../sandbox/sandbox.js';
import type { SandboxMode } from '../types/index.js';
import { audit, getCurrentSessionId, AuditEventType } from './audit.js';

interface Task {
  id: string;
  input: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const QUEUE_DIR = join(tmpdir(), 'vectahub');
const SOCKET_PATH = join(tmpdir(), 'vectahub.sock');
const sandbox = createSandboxManager({
  mode: 'RELAXED',
});

function ensureQueueDir(): void {
  if (!existsSync(QUEUE_DIR)) {
    mkdirSync(QUEUE_DIR, { recursive: true });
  }
}

function saveTask(task: Task): void {
  ensureQueueDir();
  const filePath = join(QUEUE_DIR, `${task.id}.json`);
  writeFileSync(filePath, JSON.stringify(task, null, 2));
}

function getTask(id: string): Task | null {
  const filePath = join(QUEUE_DIR, `${id}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Task;
}

function listTasks(): Task[] {
  ensureQueueDir();
  const files = readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(readFileSync(join(QUEUE_DIR, f), 'utf-8')) as Task);
}

async function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const fullCmd = `${cmd} ${args.join(' ')}`;
  const sessionId = getCurrentSessionId();
  audit.workflowStep(fullCmd, cmd, args, sessionId);

  const result = await sandbox.exec(cmd, args, {
    cwd: process.cwd(),
  });

  audit.executorResult(fullCmd, cmd, result.exitCode || 0, result.stdout + result.stderr, 0, sessionId);

  if (!result.success) {
    throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const fullCmd = `git ${args.join(' ')}`;
  const sessionId = getCurrentSessionId();
  audit.workflowStep(fullCmd, 'git', args, sessionId);

  const result = await sandbox.exec('git', args, {
    cwd: process.cwd(),
  });

  audit.executorResult(fullCmd, 'git', result.exitCode || 0, result.stdout + result.stderr, 0, sessionId);

  if (!result.success) {
    throw new Error(result.stderr || `Git command failed with exit code ${result.exitCode}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function executeGitWorkflow(input: string): Promise<string> {
  const sessionId = getCurrentSessionId();
  const logs: string[] = [];
  const workflowId = `wf_${Date.now()}`;

  audit.workflowStart(workflowId, 'GIT_WORKFLOW', sessionId);

  logs.push('📊 Checking git status...');
  const status = await runGit(['status', '--short']);
  if (!status.stdout.trim()) {
    audit.workflowEnd(workflowId, 'COMPLETED', 0, sessionId);
    return 'Working tree clean, nothing to commit.';
  }
  logs.push(`Changed files:\n${status.stdout}`);

  logs.push('📦 Staging all changes...');
  await runGit(['add', '-A']);

  const commitMsg = input || `Auto commit at ${new Date().toISOString()}`;
  logs.push(`📝 Committing: "${commitMsg}"`);
  try {
    const commitResult = await runGit(['commit', '-m', commitMsg]);
    logs.push(commitResult.stdout.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('nothing to commit')) {
      logs.push('Nothing to commit.');
    } else {
      logs.push(`Commit output: ${msg}`);
    }
  }

  logs.push('🚀 Pushing to remote...');
  try {
    const pushResult = await runGit(['push']);
    logs.push(pushResult.stdout.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`Push skipped: ${msg.split('\n')[0]}`);
  }

  const duration = Date.now() - parseInt(workflowId.split('_')[1] || '0');
  audit.workflowEnd(workflowId, 'COMPLETED', duration, sessionId);

  return logs.join('\n');
}

async function executeTask(input: string): Promise<string> {
  const parser = createNLParser();
  const intent = parser.parse(input);
  const sessionId = getCurrentSessionId();

  audit.intentMatch(intent.intent, intent.confidence, intent.params as Record<string, unknown>, sessionId);

  if (intent.intent === 'GIT_WORKFLOW') {
    return executeGitWorkflow(input);
  }

  return `Intent matched: ${intent.intent}\nExecution not yet implemented for this intent type.`;
}

async function processTask(task: Task): Promise<Task> {
  const sessionId = getCurrentSessionId();
  task.status = 'running';
  saveTask(task);

  audit.log({
    event: AuditEventType.WORKFLOW_START,
    timestamp: new Date().toISOString(),
    sessionId,
    module: 'Service',
    action: 'process_task',
    input: { taskId: task.id, input: task.input },
    success: true,
  });

  const startTime = Date.now();

  try {
    const result = await executeTask(task.input);
    task.result = result;
    task.status = 'completed';
    task.completedAt = Date.now();

    audit.workflowEnd(task.id, 'COMPLETED', Date.now() - startTime, sessionId);
  } catch (error) {
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : String(error);
    task.completedAt = Date.now();

    audit.log({
      event: AuditEventType.WORKFLOW_END,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Service',
      action: 'process_task',
      input: { taskId: task.id },
      output: { error: task.error },
      duration: Date.now() - startTime,
      success: false,
      error: task.error,
    });
  }

  saveTask(task);
  return task;
}

function createSocketServer(): ReturnType<typeof createServer> {
  const server = createServer((socket) => {
    let buffer = '';
    const sessionId = getCurrentSessionId();

    socket.on('data', (data) => {
      buffer += data.toString();

      try {
        const message = JSON.parse(buffer);
        buffer = '';

        if (message.type === 'submit') {
          const task: Task = {
            id: randomUUID(),
            input: message.input,
            status: 'pending',
            createdAt: Date.now(),
          };
          saveTask(task);

          audit.cliCommand('client submit', [message.input], sessionId);

          socket.write(JSON.stringify({
            type: 'submitted',
            taskId: task.id,
          }) + '\n');

          setImmediate(() => processTask(task));
        } else if (message.type === 'status') {
          const task = getTask(message.taskId);
          if (task) {
            socket.write(JSON.stringify({
              type: 'status',
              task,
            }) + '\n');
          } else {
            socket.write(JSON.stringify({
              type: 'error',
              message: 'Task not found',
            }) + '\n');
          }
        } else if (message.type === 'list') {
          const tasks = listTasks();
          socket.write(JSON.stringify({
            type: 'list',
            tasks,
          }) + '\n');
        } else if (message.type === 'shutdown') {
          socket.write(JSON.stringify({
            type: 'shutting_down',
          }) + '\n');
          socket.end();
          server.close();
          process.exit(0);
        } else if (message.type === 'getMode') {
          socket.write(JSON.stringify({
            type: 'mode',
            mode: sandbox.getConfig().mode,
          }) + '\n');
        } else if (message.type === 'setMode') {
          const mode = message.mode as SandboxMode;
          const oldMode = sandbox.getConfig().mode;
          sandbox.setMode(mode);

          audit.configChange('Sandbox', 'mode', oldMode, mode, sessionId);

          socket.write(JSON.stringify({
            type: 'modeChanged',
            mode,
          }) + '\n');
        } else if (message.type === 'getConfig') {
          socket.write(JSON.stringify({
            type: 'config',
            config: sandbox.getConfig(),
          }) + '\n');
        }
      } catch {
        // 等待更多数据
      }
    });

    socket.on('error', (err) => {
      audit.log({
        event: AuditEventType.WORKFLOW_END,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Service',
        action: 'socket_error',
        output: { error: err.message },
        success: false,
        error: err.message,
      });
    });
  });

  return server;
}

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

    if (existsSync(SOCKET_PATH)) {
      unlinkSync(SOCKET_PATH);
    }

    const server = createSocketServer();

    server.listen(SOCKET_PATH, () => {
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
    });

    server.on('error', (err) => {
      console.error('❌ Server error:', err.message);
      audit.log({
        event: AuditEventType.WORKFLOW_END,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Service',
        action: 'serve_error',
        output: { error: err.message },
        success: false,
        error: err.message,
      });
      process.exit(1);
    });

    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      audit.log({
        event: AuditEventType.CLI_COMMAND,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Service',
        action: 'serve_shutdown',
        input: { signal: 'SIGINT' },
        success: true,
      });
      server.close();
      if (existsSync(SOCKET_PATH)) {
        unlinkSync(SOCKET_PATH);
      }
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\n🛑 Shutting down...');
      audit.log({
        event: AuditEventType.CLI_COMMAND,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Service',
        action: 'serve_shutdown',
        input: { signal: 'SIGTERM' },
        success: true,
      });
      server.close();
      if (existsSync(SOCKET_PATH)) {
        unlinkSync(SOCKET_PATH);
      }
      process.exit(0);
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
        process.exit(1);
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
        process.exit(1);
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
        process.exit(1);
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
            process.exit(1);
            return;
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
        process.exit(1);
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
        process.exit(1);
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
        process.exit(1);
      });
    })
  );
