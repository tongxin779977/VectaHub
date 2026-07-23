import { createServer, createConnection, type Server, type Socket } from 'net';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import type { SandboxMode } from '../types/index.js';
import { AuditEventType, type AuditHelper } from '../infrastructure/audit/index.js';
import { processInput } from '../nl/orchestrator.js';
import type pino from 'pino';

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

export interface SocketServerDeps {
  auditHelper: AuditHelper;
  logger: Pick<pino.Logger, 'error'>;
  getSessionId: () => string;
  llmConfigProvider?: () => unknown;
}

const DEFAULT_CONFIG: SocketServerConfig = {
  socketPath: join(tmpdir(), 'vectahub.sock'),
  sandboxMode: 'RELAXED',
};

const VALID_SANDBOX_MODES: ReadonlySet<SandboxMode> = new Set(['STRICT', 'RELAXED', 'CONSENSUS']);

export class SocketServer {
  private server: Server | null = null;
  private config: SocketServerConfig;
  private readonly auditHelper: AuditHelper;
  private readonly logger: Pick<pino.Logger, 'error'>;
  private readonly getSessionId: () => string;
  private readonly llmConfigProvider: () => unknown;
  private sandbox: SandboxManager;
  private tasks: Map<string, Task> = new Map();
  private socketBuffers: WeakMap<Socket, string> = new WeakMap();

  constructor(config: SocketServerConfig = {}, deps: SocketServerDeps) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.auditHelper = deps.auditHelper;
    this.logger = deps.logger;
    this.getSessionId = deps.getSessionId;
    this.llmConfigProvider = deps.llmConfigProvider ?? (() => undefined);
    this.sandbox = createSandboxManager(
      { mode: this.config.sandboxMode! },
      { audit: this.auditHelper }
    );
  }

  private get socketPath(): string {
    return this.config.socketPath!;
  }

  private async executeTask(input: string): Promise<string> {
    const sessionId = this.getSessionId();

    try {
      const result = await processInput(input, this.llmConfigProvider() ?? undefined, this.auditHelper, this.logger);
      this.auditHelper.intentMatch(result.intent ?? 'UNKNOWN', result.confidence, result.params as Record<string, unknown> ?? {}, sessionId);

      const tasks = result.taskList?.tasks ?? [];
      if (tasks.length === 0) {
        const warnings = result.taskList?.warnings?.filter(Boolean) ?? [];
        const reason = warnings[0] ?? result.metadata.fallbackReason ?? 'No executable plan generated';
        return `No executable plan: ${reason}`;
      }

      const intentLine = `Intent: ${result.intent ?? 'UNKNOWN'} (confidence: ${result.confidence.toFixed(2)})`;
      return `${intentLine}\nExecution delegated to Skill System.`;
    } catch (err) {
      this.auditHelper.intentMatch('UNKNOWN', 0, {}, sessionId);
      return `No match: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async processTask(task: Task): Promise<void> {
    const sessionId = this.getSessionId();
    task.status = 'running';

    this.auditHelper.log({
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

      this.auditHelper.workflowEnd(task.id, 'COMPLETED', Date.now() - startTime, sessionId);
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = Date.now();

      this.auditHelper.log({
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
    const incomingData = data.toString();
    const pendingBuffer = this.socketBuffers.get(socket) ?? '';
    const mergedBuffer = pendingBuffer + incomingData;
    const frames = mergedBuffer.split('\n');
    const incompleteFrame = frames.pop() ?? '';

    this.socketBuffers.set(socket, incompleteFrame);

    for (const frame of frames) {
      const messageStr = frame.trim();
      if (!messageStr) {
        continue;
      }
      try {
        const message = JSON.parse(messageStr);
        void this.handleMessage(socket, message);
      } catch {
        socket.write(JSON.stringify({ type: 'error', message: 'Invalid JSON' }) + '\n');
      }
    }
  }

  private async handleMessage(socket: Socket, message: Record<string, unknown>): Promise<void> {
    const sessionId = this.getSessionId();

    switch (message.type) {
      case 'submit': {
        const task: Task = {
          id: randomUUID(),
          input: String(message.input),
          status: 'pending',
          createdAt: Date.now(),
        };
        this.tasks.set(task.id, task);

        this.auditHelper.cliCommand('daemon submit', [String(message.input)], sessionId);

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
        const mode = String(message.mode ?? '');
        if (!VALID_SANDBOX_MODES.has(mode as SandboxMode)) {
          socket.write(JSON.stringify({ type: 'error', message: 'Invalid mode. Use: STRICT | RELAXED | CONSENSUS' }) + '\n');
          break;
        }
        const validatedMode = mode as SandboxMode;
        const oldMode = this.sandbox.getConfig().mode;
        this.sandbox.setMode(validatedMode);
        this.auditHelper.configChange('Sandbox', 'mode', oldMode, validatedMode, sessionId);
        socket.write(JSON.stringify({ type: 'modeChanged', mode: validatedMode }) + '\n');
        break;
      }
      default:
        socket.write(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }) + '\n');
    }
  }

  async start(): Promise<void> {
    const auditResult = await this.sandbox.getStatusSummary();
    const sessionId = this.getSessionId();
    
    this.auditHelper.log({
      event: AuditEventType.ENV_AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Daemon',
      action: 'start_audit',
      output: auditResult,
      success: true,
    });

    try { unlinkSync(this.socketPath); } catch { /* ignore if not exists */ }

    this.server = createServer((socket) => {
      socket.on('data', (data) => this.handleSocketData(socket, data));
      socket.on('error', (err) => {
        this.logger.error({ error: err }, 'Socket error');
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
    try { unlinkSync(this.socketPath); } catch { /* ignore if not exists */ }
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
