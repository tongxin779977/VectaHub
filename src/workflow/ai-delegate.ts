import { audit } from '../utils/audit.js';

export type AIDelegateProvider = 'gemini' | 'claude' | 'codex' | 'aider' | 'opencli' | 'custom';

export interface AIAdapter {
  name: AIDelegateProvider;
  buildCommand(prompt: string, context: Record<string, unknown>, options?: { timeout?: number }): string[];
}

export interface AIDelegateOptions {
  provider: AIDelegateProvider;
  prompt?: string;
  context?: Record<string, unknown>;
  maxTurns?: number;
  allowedTools?: string[];
  timeout?: number;
  outputFormat?: 'text' | 'json' | 'stream-json';
  retry?: RetryPolicy;
  sessionId?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  retryOnExitCodes: number[];
  backoffMs: number;
}

export interface DelegateResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
  duration: number;
  sessionId?: string;
}

export interface Session {
  id: string;
  provider: AIDelegateProvider;
  createdAt: Date;
  lastActiveAt: Date;
  status: 'active' | 'idle' | 'terminated';
  context: Record<string, unknown>;
  messageCount: number;
}

export interface Task {
  id: string;
  prompt: string;
  context: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: DelegateResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  priority: number;
}

export interface HealthStatus {
  sessionId: string;
  isHealthy: boolean;
  lastCheck: Date;
  messageCount: number;
  idleTimeMs: number;
  provider: AIDelegateProvider;
}

export interface TaskQueue {
  enqueue(task: Task): void;
  dequeue(): Task | undefined;
  size(): number;
  clear(): void;
}

export interface SessionManager {
  createSession(provider: AIDelegateProvider, initialContext?: Record<string, unknown>): Session;
  getSession(sessionId: string): Session | undefined;
  updateSession(sessionId: string, updates: Partial<Session>): void;
  deleteSession(sessionId: string): void;
  listSessions(): Session[];
  getOrCreateSession(provider: AIDelegateProvider, context?: Record<string, unknown>): Session;
}

export interface DaemonManager {
  start(provider: AIDelegateProvider, options?: Partial<AIDelegateOptions>): Promise<string>;
  stop(daemonId: string): Promise<void>;
  getStatus(daemonId: string): { running: boolean; sessionId?: string; taskCount: number };
  listDaemons(): { daemonId: string; provider: AIDelegateProvider; status: string }[];
  healthCheck(daemonId: string): Promise<HealthStatus>;
}

export interface DelegateExecutor {
  delegate(options: AIDelegateOptions, context?: Record<string, unknown>): Promise<DelegateResult>;
  createSession(provider: AIDelegateProvider, initialContext?: Record<string, unknown>): Session;
  getSession(sessionId: string): Session | undefined;
  submitTask(prompt: string, context?: Record<string, unknown>, priority?: number): string;
  getTaskResult(taskId: string): Task | undefined;
  healthCheck(sessionId: string): Promise<HealthStatus>;
}

let sessionCounter = 0;
let taskCounter = 0;
let daemonCounter = 0;

const sessions = new Map<string, Session>();
const tasks = new Map<string, Task>();
const daemons = new Map<string, { provider: AIDelegateProvider; sessionId: string; running: boolean }>();

function generateSessionId(): string {
  return `session_${++sessionCounter}_${Date.now().toString(36)}`;
}

function generateTaskId(): string {
  return `task_${++taskCounter}_${Date.now().toString(36)}`;
}

export function createSessionManager(): SessionManager {
  return {
    createSession(provider: AIDelegateProvider, initialContext?: Record<string, unknown>): Session {
      const session: Session = {
        id: generateSessionId(),
        provider,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        status: 'active',
        context: initialContext || {},
        messageCount: 0,
      };
      sessions.set(session.id, session);
      return session;
    },

    getSession(sessionId: string): Session | undefined {
      return sessions.get(sessionId);
    },

    updateSession(sessionId: string, updates: Partial<Session>): void {
      const session = sessions.get(sessionId);
      if (session) {
        Object.assign(session, updates, { lastActiveAt: new Date() });
      }
    },

    deleteSession(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (session) {
        session.status = 'terminated';
        sessions.delete(sessionId);
      }
    },

    listSessions(): Session[] {
      return Array.from(sessions.values());
    },

    getOrCreateSession(provider: AIDelegateProvider, context?: Record<string, unknown>): Session {
      const existing = Array.from(sessions.values()).find(
        s => s.provider === provider && s.status === 'active'
      );
      if (existing) {
        return existing;
      }
      return this.createSession(provider, context);
    },
  };
}

export function createTaskQueue(): TaskQueue {
  const queue: Task[] = [];

  return {
    enqueue(task: Task): void {
      const index = queue.findIndex(t => t.priority < task.priority);
      if (index === -1) {
        queue.push(task);
      } else {
        queue.splice(index, 0, task);
      }
      tasks.set(task.id, task);
    },

    dequeue(): Task | undefined {
      const task = queue.shift();
      return task;
    },

    size(): number {
      return queue.length;
    },

    clear(): void {
      for (const task of queue) {
        tasks.delete(task.id);
      }
      queue.length = 0;
    },
  };
}

const taskQueue = createTaskQueue();

export function createDaemonManager(): DaemonManager {
  return {
    async start(provider: AIDelegateProvider, options?: Partial<AIDelegateOptions>): Promise<string> {
      const daemonId = `daemon_${++daemonCounter}_${Date.now().toString(36)}`;
      const sessionManager = createSessionManager();
      const session = sessionManager.createSession(provider, options?.context);

      daemons.set(daemonId, {
        provider,
        sessionId: session.id,
        running: true,
      });

      return daemonId;
    },

    async stop(daemonId: string): Promise<void> {
      const daemon = daemons.get(daemonId);
      if (daemon) {
        daemon.running = false;
        if (daemon.sessionId) {
          createSessionManager().deleteSession(daemon.sessionId);
        }
        daemons.delete(daemonId);
      }
    },

    getStatus(daemonId: string): { running: boolean; sessionId?: string; taskCount: number } {
      const daemon = daemons.get(daemonId);
      if (!daemon) {
        return { running: false, taskCount: 0 };
      }
      return {
        running: daemon.running,
        sessionId: daemon.sessionId,
        taskCount: taskQueue.size(),
      };
    },

    listDaemons(): { daemonId: string; provider: AIDelegateProvider; status: string }[] {
      return Array.from(daemons.entries()).map(([daemonId, daemon]) => ({
        daemonId,
        provider: daemon.provider,
        status: daemon.running ? 'running' : 'stopped',
      }));
    },

    async healthCheck(daemonId: string): Promise<HealthStatus> {
      const daemon = daemons.get(daemonId);
      if (!daemon) {
        throw new Error(`Daemon ${daemonId} not found`);
      }

      const sessionManager = createSessionManager();
      const session = sessionManager.getSession(daemon.sessionId);
      if (!session) {
        throw new Error(`Session ${daemon.sessionId} not found`);
      }

      return {
        sessionId: session.id,
        isHealthy: daemon.running && session.status === 'active',
        lastCheck: new Date(),
        messageCount: session.messageCount,
        idleTimeMs: Date.now() - session.lastActiveAt.getTime(),
        provider: daemon.provider,
      };
    },
  };
}

export function createDelegateExecutor(): DelegateExecutor {
  const sessionManager = createSessionManager();

  async function executeDelegate(
    provider: AIDelegateProvider,
    prompt: string,
    options?: Partial<AIDelegateOptions>
  ): Promise<DelegateResult> {
    const startTime = Date.now();
    const sessionId = options?.sessionId || sessionManager.getOrCreateSession(provider).id;
    const retryPolicy = options?.retry || { maxRetries: 3, retryOnExitCodes: [1], backoffMs: 1000 };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        let output = '';
        let exitCode = 0;

        switch (provider) {
          case 'gemini':
            output = await executeGemini(prompt, options);
            break;
          case 'claude':
            output = await executeClaude(prompt, options);
            break;
          case 'aider':
            output = await executeAider(prompt, options);
            break;
          case 'opencli':
            output = await executeOpenCLI(prompt, options);
            break;
          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }

        sessionManager.updateSession(sessionId, { messageCount: sessionManager.getSession(sessionId)!.messageCount + 1 });

        return {
          success: true,
          output,
          exitCode,
          duration: Date.now() - startTime,
          sessionId,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const shouldRetry = retryPolicy.retryOnExitCodes.includes(-1) && attempt < retryPolicy.maxRetries;
        if (shouldRetry) {
          await new Promise(resolve => setTimeout(resolve, retryPolicy.backoffMs * (attempt + 1)));
          continue;
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      exitCode: -1,
      duration: Date.now() - startTime,
      sessionId,
    };
  }

  async function executeGemini(prompt: string, options?: Partial<AIDelegateOptions>): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }
    return `[GEMINI] Would execute: ${prompt.substring(0, 50)}... (API integration placeholder)`;
  }

  async function executeClaude(prompt: string, options?: Partial<AIDelegateOptions>): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    return `[CLAUDE] Would execute: ${prompt.substring(0, 50)}... (API integration placeholder)`;
  }

  async function executeAider(prompt: string, options?: Partial<AIDelegateOptions>): Promise<string> {
    return `[AIDER] Would execute: ${prompt.substring(0, 50)}... (aider integration placeholder)`;
  }

  async function executeOpenCLI(prompt: string, options?: Partial<AIDelegateOptions>): Promise<string> {
    return `[OPENCLI] Would execute: ${prompt.substring(0, 50)}... (opencli integration placeholder)`;
  }

  return {
    async delegate(options: AIDelegateOptions, context?: Record<string, unknown>): Promise<DelegateResult> {
      const mergedContext = { ...options.context, ...context };
      return executeDelegate(options.provider, options.prompt || '', { ...options, context: mergedContext });
    },

    createSession(provider: AIDelegateProvider, initialContext?: Record<string, unknown>): Session {
      return sessionManager.createSession(provider, initialContext);
    },

    getSession(sessionId: string): Session | undefined {
      return sessionManager.getSession(sessionId);
    },

    submitTask(prompt: string, context?: Record<string, unknown>, priority: number = 5): string {
      const taskId = generateTaskId();
      const task: Task = {
        id: taskId,
        prompt,
        context: context || {},
        status: 'pending',
        createdAt: new Date(),
        priority,
      };

      taskQueue.enqueue(task);
      return taskId;
    },

    getTaskResult(taskId: string): Task | undefined {
      return tasks.get(taskId);
    },

    async healthCheck(sessionId: string): Promise<HealthStatus> {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      return {
        sessionId: session.id,
        isHealthy: session.status === 'active',
        lastCheck: new Date(),
        messageCount: session.messageCount,
        idleTimeMs: Date.now() - session.lastActiveAt.getTime(),
        provider: session.provider,
      };
    },
  };
}

export const delegateExecutor = createDelegateExecutor();
export const sessionMgr = createSessionManager();
export const daemonMgr = createDaemonManager();

export const GEMINI_ADAPTER: AIAdapter = {
  name: 'gemini',
  buildCommand: (prompt, context, options) => ['echo', `[GEMINI] ${prompt}`],
};

export const CLAUDE_ADAPTER: AIAdapter = {
  name: 'claude',
  buildCommand: (prompt, context, options) => ['echo', `[CLAUDE] ${prompt}`],
};

export const CODEX_ADAPTER: AIAdapter = {
  name: 'codex',
  buildCommand: (prompt, context, options) => ['echo', `[CODEX] ${prompt}`],
};

export const AIDER_ADAPTER: AIAdapter = {
  name: 'aider',
  buildCommand: (prompt, context, options) => ['echo', `[AIDER] ${prompt}`],
};