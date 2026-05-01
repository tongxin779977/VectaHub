import { Command } from 'commander';
import { createServer, createConnection } from 'net';
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { createNLParser } from '../nl/parser.js';

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

function appendLog(message: string): void {
  ensureQueueDir();
  const logFile = join(QUEUE_DIR, 'server.log');
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

function runCommand(cmd: string, args: string[]): { stdout: string; stderr: string } {
  appendLog(`Executing: ${cmd} ${args.join(' ')}`);
  const result = execSync(cmd, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    input: args.join('\x00'),
    env: { ...process.env, GIT_ARGS: args.join('\x00') },
  });
  return { stdout: result, stderr: '' };
}

function runGit(args: string[]): { stdout: string; stderr: string } {
  const cmd = `git ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`;
  appendLog(`Executing: ${cmd}`);
  const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return { stdout: result, stderr: '' };
}

async function executeGitWorkflow(input: string): Promise<string> {
  const logs: string[] = [];

  logs.push('📊 Checking git status...');
  const status = runGit(['status', '--short']);
  if (!status.stdout.trim()) {
    return 'Working tree clean, nothing to commit.';
  }
  logs.push(`Changed files:\n${status.stdout}`);

  logs.push('📦 Staging all changes...');
  runGit(['add', '-A']);

  const commitMsg = input || `Auto commit at ${new Date().toISOString()}`;
  logs.push(`📝 Committing: "${commitMsg}"`);
  try {
    const commitResult = runGit(['commit', '-m', commitMsg]);
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
    const pushResult = runGit(['push']);
    logs.push(pushResult.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`Push skipped: ${msg.split('\n')[0]}`);
  }

  return logs.join('\n');
}

async function executeTask(input: string): Promise<string> {
  const parser = createNLParser();
  const intent = parser.parse(input);

  if (intent.intent === 'GIT_WORKFLOW') {
    return executeGitWorkflow(input);
  }

  return `Intent matched: ${intent.intent}\nExecution not yet implemented for this intent type.`;
}

async function processTask(task: Task): Promise<Task> {
  task.status = 'running';
  saveTask(task);
  appendLog(`Processing task: ${task.id} - "${task.input}"`);

  try {
    const result = await executeTask(task.input);
    task.result = result;
    task.status = 'completed';
    task.completedAt = Date.now();
    appendLog(`Task ${task.id} completed`);
  } catch (error) {
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : String(error);
    task.completedAt = Date.now();
    appendLog(`Task ${task.id} failed: ${task.error}`);
  }

  saveTask(task);
  return task;
}

function createSocketServer(): ReturnType<typeof createServer> {
  const server = createServer((socket) => {
    let buffer = '';

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
          appendLog(`Task submitted: ${task.id}`);

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
        }
      } catch {
        // 等待更多数据
      }
    });

    socket.on('error', (err) => {
      appendLog(`Socket error: ${err.message}`);
    });
  });

  return server;
}

export const serveCmd = new Command('serve')
  .description('Start VectaHub as a background service')
  .option('-d, --daemon', 'Run in daemon mode', false)
  .action(async (options) => {
    console.log('\n🚀 Starting VectaHub Service...\n');
    console.log(`Socket: ${SOCKET_PATH}`);
    console.log(`Queue:  ${QUEUE_DIR}\n`);

    if (existsSync(SOCKET_PATH)) {
      unlinkSync(SOCKET_PATH);
    }

    const server = createSocketServer();

    server.listen(SOCKET_PATH, () => {
      appendLog(`Server started on ${SOCKET_PATH}`);
      console.log('✅ Service running');
      console.log('\n📋 Usage:');
      console.log('  vectahub client submit "压缩图片"');
      console.log('  vectahub client status <task-id>');
      console.log('  vectahub client list');
      console.log('  vectahub client shutdown\n');

      if (options.daemon) {
        console.log('Running in daemon mode. Use "vectahub client shutdown" to stop.\n');
      }
    });

    server.on('error', (err) => {
      console.error('❌ Server error:', err.message);
      process.exit(1);
    });

    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      appendLog('Server stopped (SIGINT)');
      server.close();
      if (existsSync(SOCKET_PATH)) {
        unlinkSync(SOCKET_PATH);
      }
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\n🛑 Shutting down...');
      appendLog('Server stopped (SIGTERM)');
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
      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'submit',
          input,
        }) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'submitted') {
          console.log(`\n✅ Task submitted: ${response.taskId}`);
          console.log(`Check status: vectahub client status ${response.taskId}\n`);
        }
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        console.error(`Socket: ${SOCKET_PATH}`);
        process.exit(1);
      });
    })
  )
  .addCommand(new Command('status')
    .description('Check task status')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId: string) => {
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
          console.log('\n📋 Task Status');
          console.log('─'.repeat(40));
          console.log(`ID:     ${task.id}`);
          console.log(`Input:  ${task.input}`);
          console.log(`Status: ${task.status}`);
          if (task.result) console.log(`\nResult:\n${task.result}`);
          if (task.error) console.log(`Error:  ${task.error}`);
          console.log('');
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
      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'list',
        }) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'list') {
          console.log('\n📋 Task List');
          console.log('─'.repeat(80));
          console.log('ID'.padEnd(38), 'Status'.padEnd(12), 'Input');
          console.log('─'.repeat(80));
          for (const task of response.tasks) {
            console.log(
              task.id.padEnd(38),
              task.status.padEnd(12),
              task.input
            );
          }
          console.log(`\nTotal: ${response.tasks.length} tasks\n`);
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
      const socket = createConnection({ path: SOCKET_PATH }, () => {
        socket.write(JSON.stringify({
          type: 'shutdown',
        }) + '\n');
      });

      socket.on('data', () => {
        console.log('\n🛑 Service shutting down...\n');
        socket.end();
      });

      socket.on('error', () => {
        console.error('❌ Cannot connect to service. Is it running?');
        process.exit(1);
      });
    })
  );
