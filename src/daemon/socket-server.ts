import { createServer, createConnection, type Server, type Socket } from 'net';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createCoordinator, adaptAllTemplates } from '../nl/core/index.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import type { SandboxMode } from '../types/index.js';
import { audit, getCurrentSessionId, AuditEventType } from '../utils/audit.js';
import { createSkillExecutor } from '../skills/executor.js';

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
  sandboxMode?: SandboxMode;
}

const DEFAULT_CONFIG: SocketServerConfig = {
  socketPath: join(tmpdir(), 'vectahub.sock'),
  sandboxMode: 'RELAXED',
};

export class SocketServer {
  private server: Server | null = null;
  private config: SocketServerConfig;
  private sandbox: SandboxManager;
  private tasks: Map<string, Task> = new Map();
  private executor = createSkillExecutor();

  constructor(config: SocketServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sandbox = createSandboxManager({ mode: this.config.sandboxMode! });
  }

  private get socketPath(): string {
    return this.config.socketPath!;
  }

  private async executeTask(input: string): Promise<string> {
    const coordinator = createCoordinator(adaptAllTemplates(INTENT_TEMPLATES));
    const matchResult = coordinator.match(input);
    const sessionId = getCurrentSessionId();

    const intentLines: string[] = [];
    for (const intent of matchResult.intents) {
      audit.intentMatch(intent.intent, intent.confidence, intent.params as Record<string, unknown>, sessionId);
      intentLines.push(`Intent: ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`);
    }

    const multiIntentHeader = matchResult.isMultiIntent
      ? `Multi-Intent Detected (${matchResult.intents.length} intents)\n${'─'.repeat(40)}\n`
      : '';

    // Delegate to Skill system via Executor
    // Note: Here we'd ideally lookup a specific skill based on the intent.
    // For now, we provide a unified execution bridge.
    try {
      // In a real implementation, we would map matchResult.intents[0].intent to a specific Skill object
      // For RP-10, we've removed the hardcoded Git logic.
      if (matchResult.intents.length > 0) {
        return `${multiIntentHeader}${intentLines.join('\n')}\nExecution delegated to Skill System.`;
      }
    } catch (err) {
      throw new Error(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return `${multiIntentHeader}${intentLines.join('\n')}\nNo specific execution path found.`;
  }

  private async processTask(task: Task): Promise<void> {
    const sessionId = getCurrentSessionId();
    task.status = 'running';

    audit.log({
      event: AuditEventType.WORKFLOW_START,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Daemon',
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
        module: 'Daemon',
        action: 'process_task',
        input: { taskId: task.id },
        output: { error: task.error },
        duration: Date.now() - startTime,
        success: false,
        error: task.error,
      });
    }
  }

  private handleSocketData(socket: Socket, data: Buffer): void {
    const messageStr = data.toString().trim();
    if (!messageStr) return;

    try {
      const message = JSON.parse(messageStr);
      this.handleMessage(socket, message);
    } catch (err) {
      socket.write(JSON.stringify({ type: 'error', message: 'Invalid JSON' }) + '\n');
    }
  }

  private async handleMessage(socket: Socket, message: Record<string, unknown>): Promise<void> {
    const sessionId = getCurrentSessionId();

    switch (message.type) {
      case 'submit': {
        const task: Task = {
          id: randomUUID(),
          input: String(message.input),
          status: 'pending',
          createdAt: Date.now(),
        };
        this.tasks.set(task.id, task);

        audit.cliCommand('daemon submit', [String(message.input)], sessionId);

        socket.write(JSON.stringify({ type: 'submitted', taskId: task.id }) + '\n');
        setImmediate(() => this.processTask(task));
        break;
      }
      case 'status': {
        const task = this.tasks.get(String(message.taskId));
        socket.write(JSON.stringify({ type: 'status', task: task || null }) + '\n');
        break;
      }
      case 'list': {
        socket.write(JSON.stringify({ type: 'list', tasks: Array.from(this.tasks.values()) }) + '\n');
        break;
      }
      case 'shutdown': {
        socket.write(JSON.stringify({ type: 'shutting_down' }) + '\n');
        socket.end();
        await this.stop();
        process.exit(0);
        break;
      }
      case 'getMode': {
        socket.write(JSON.stringify({ type: 'mode', mode: this.sandbox.getConfig().mode }) + '\n');
        break;
      }
      case 'setMode': {
        const mode = message.mode as SandboxMode;
        const oldMode = this.sandbox.getConfig().mode;
        this.sandbox.setMode(mode);
        audit.configChange('Sandbox', 'mode', oldMode, mode, sessionId);
        socket.write(JSON.stringify({ type: 'modeChanged', mode }) + '\n');
        break;
      }
      default:
        socket.write(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }) + '\n');
    }
  }

  async start(): Promise<void> {
    const auditResult = await this.sandbox.getStatusSummary();
    const sessionId = getCurrentSessionId();
    
    audit.log({
      event: AuditEventType.ENV_AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Daemon',
      action: 'start_audit',
      output: auditResult,
      success: true,
    });

    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    this.server = createServer((socket) => {
      socket.on('data', (data) => this.handleSocketData(socket, data));
      socket.on('error', (err) => {
        console.error('Socket error:', err);
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => resolve());
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }
  }

  getSocketPath(): string {
    return this.socketPath;
  }
}

export async function createClientConnection(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath }, () => resolve(socket));
    socket.on('error', reject);
  });
}

