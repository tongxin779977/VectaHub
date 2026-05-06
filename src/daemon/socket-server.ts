import { createServer, createConnection, type Server, type Socket } from 'net';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createCoordinator, adaptAllTemplates } from '../nl/core/index.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import type { SandboxMode } from '../types/index.js';
import { audit, getCurrentSessionId, AuditEventType } from '../utils/audit.js';

export interface Task {
  id: string;
  input: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface SocketServerConfig {
  socketPath?: string;
  queueDir?: string;
  sandboxMode?: SandboxMode;
}

const DEFAULT_CONFIG: SocketServerConfig = {
  socketPath: join(tmpdir(), 'vectahub.sock'),
  queueDir: join(tmpdir(), 'vectahub'),
  sandboxMode: 'RELAXED',
};

export class SocketServer {
  private server: Server | null = null;
  private config: SocketServerConfig;
  private sandbox: SandboxManager;

  constructor(config: SocketServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sandbox = createSandboxManager({ mode: this.config.sandboxMode! });
    this.ensureQueueDir();
  }

  private get socketPath(): string {
    return this.config.socketPath!;
  }

  private get queueDir(): string {
    return this.config.queueDir!;
  }

  private ensureQueueDir(): void {
    if (!existsSync(this.queueDir)) {
      mkdirSync(this.queueDir, { recursive: true });
    }
  }

  private saveTask(task: Task): void {
    this.ensureQueueDir();
    const filePath = join(this.queueDir, `${task.id}.json`);
    writeFileSync(filePath, JSON.stringify(task, null, 2));
  }

  private getTask(id: string): Task | null {
    const filePath = join(this.queueDir, `${id}.json`);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Task;
  }

  private listTasks(): Task[] {
    this.ensureQueueDir();
    const files = readdirSync(this.queueDir).filter(f => f.endsWith('.json'));
    return files.map(f => JSON.parse(readFileSync(join(this.queueDir, f), 'utf-8')) as Task);
  }

  private async runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    const fullCmd = `${cmd} ${args.join(' ')}`;
    const sessionId = getCurrentSessionId();
    audit.workflowStep(fullCmd, cmd, args, sessionId);

    const result = await this.sandbox.exec(cmd, args, {
      cwd: process.cwd(),
    });

    audit.executorResult(fullCmd, cmd, result.exitCode || 0, 0, sessionId, { output: result.stdout + result.stderr });

    if (!result.success) {
      throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}`);
    }
    return { stdout: result.stdout, stderr: result.stderr };
  }

  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const fullCmd = `git ${args.join(' ')}`;
    const sessionId = getCurrentSessionId();
    audit.workflowStep(fullCmd, 'git', args, sessionId);

    const result = await this.sandbox.exec('git', args, {
      cwd: process.cwd(),
    });

    audit.executorResult(fullCmd, 'git', result.exitCode || 0, 0, sessionId, { output: result.stdout + result.stderr });

    if (!result.success) {
      throw new Error(result.stderr || `Git command failed with exit code ${result.exitCode}`);
    }
    return { stdout: result.stdout, stderr: result.stderr };
  }

  private async executeGitWorkflow(input: string): Promise<string> {
    const sessionId = getCurrentSessionId();
    const logs: string[] = [];
    const workflowId = `wf_${Date.now()}`;

    audit.workflowStart(workflowId, 'GIT_WORKFLOW', sessionId);

    logs.push('📊 Checking git status...');
    const status = await this.runGit(['status', '--short']);
    if (!status.stdout.trim()) {
      audit.workflowEnd(workflowId, 'COMPLETED', 0, sessionId);
      return 'Working tree clean, nothing to commit.';
    }
    logs.push(`Changed files:\n${status.stdout}`);

    logs.push('📦 Staging all changes...');
    await this.runGit(['add', '-A']);

    const commitMsg = input || `Auto commit at ${new Date().toISOString()}`;
    logs.push(`📝 Committing: "${commitMsg}"`);
    try {
      const commitResult = await this.runGit(['commit', '-m', commitMsg]);
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
      const pushResult = await this.runGit(['push']);
      logs.push(pushResult.stdout.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logs.push(`Push skipped: ${msg.split('\n')[0]}`);
    }

    const duration = Date.now() - parseInt(workflowId.split('_')[1] || '0');
    audit.workflowEnd(workflowId, 'COMPLETED', duration, sessionId);

    return logs.join('\n');
  }

  private async executeTask(input: string): Promise<string> {
    const coordinator = createCoordinator(adaptAllTemplates(INTENT_TEMPLATES));
    const result = coordinator.match(input);
    const sessionId = getCurrentSessionId();

    const intentLines: string[] = [];
    for (const intent of result.intents) {
      audit.intentMatch(intent.intent, intent.confidence, intent.params as Record<string, unknown>, sessionId);
      intentLines.push(`Intent: ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`);
    }

    const multiIntentHeader = result.isMultiIntent
      ? `Multi-Intent Detected (${result.intents.length} intents)\n${'─'.repeat(40)}\n`
      : '';

    if (result.intents[0]?.intent === 'GIT_WORKFLOW') {
      return `${multiIntentHeader}${intentLines.join('\n')}\n\n${await this.executeGitWorkflow(input)}`;
    }

    return `${multiIntentHeader}${intentLines.join('\n')}\nExecution not yet implemented for these intent types.`;
  }

  private async processTask(task: Task): Promise<void> {
    const sessionId = getCurrentSessionId();
    task.status = 'running';
    this.saveTask(task);

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
      const result = await this.executeTask(task.input);
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

    this.saveTask(task);
  }

  private handleSocketData(socket: Socket, data: Buffer): void {
    let buffer = '';
    buffer += data.toString();

    try {
      const message = JSON.parse(buffer);
      buffer = '';
      this.handleMessage(socket, message);
    } catch {
      // Wait for more data
    }
  }

  private async handleMessage(socket: Socket, message: Record<string, unknown>): Promise<void> {
    const sessionId = getCurrentSessionId();

    if (message.type === 'submit') {
      const task: Task = {
        id: randomUUID(),
        input: String(message.input),
        status: 'pending',
        createdAt: Date.now(),
      };
      this.saveTask(task);

      audit.cliCommand('client submit', [String(message.input)], sessionId);

      socket.write(JSON.stringify({
        type: 'submitted',
        taskId: task.id,
      }) + '\n');

      setImmediate(() => this.processTask(task));
    } else if (message.type === 'status') {
      const task = this.getTask(String(message.taskId));
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
      const tasks = this.listTasks();
      socket.write(JSON.stringify({
        type: 'list',
        tasks,
      }) + '\n');
    } else if (message.type === 'shutdown') {
      socket.write(JSON.stringify({
        type: 'shutting_down',
      }) + '\n');
      socket.end();
      this.stop();
      process.exit(0);
    } else if (message.type === 'getMode') {
      socket.write(JSON.stringify({
        type: 'mode',
        mode: this.sandbox.getConfig().mode,
      }) + '\n');
    } else if (message.type === 'setMode') {
      const mode = message.mode as SandboxMode;
      const oldMode = this.sandbox.getConfig().mode;
      this.sandbox.setMode(mode);

      audit.configChange('Sandbox', 'mode', oldMode, mode, sessionId);

      socket.write(JSON.stringify({
        type: 'modeChanged',
        mode,
      }) + '\n');
    } else if (message.type === 'getConfig') {
      socket.write(JSON.stringify({
        type: 'config',
        config: this.sandbox.getConfig(),
      }) + '\n');
    }
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (existsSync(this.socketPath)) {
        unlinkSync(this.socketPath);
      }

      this.server = createServer((socket) => {
        socket.on('data', (data) => this.handleSocketData(socket, data));

        socket.on('error', (err) => {
          audit.log({
            event: AuditEventType.WORKFLOW_END,
            timestamp: new Date().toISOString(),
            sessionId: getCurrentSessionId(),
            module: 'Service',
            action: 'socket_error',
            output: { error: err.message },
            success: false,
            error: err.message,
          });
        });
      });

      this.server.listen(this.socketPath, () => {
        resolve();
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }
  }

  getSocketPath(): string {
    return this.socketPath;
  }

  getQueueDir(): string {
    return this.queueDir;
  }
}

export async function createClientConnection(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath }, () => {
      resolve(socket);
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}
