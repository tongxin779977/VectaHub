import { spawn, ChildProcess } from 'child_process';
import { audit } from '../utils/audit.js';
import type { AIAdapter } from './ai-delegate.js';

export interface SessionConfig {
  timeout: number;
  maxTokenUsage: number;
  keepAlive: boolean;
  maxSessions: number;
}

export interface SessionContext {
  cwd?: string;
  env?: Record<string, string>;
  projectRoot?: string;
  files?: string[];
}

export interface AISession {
  id: string;
  adapter: string;
  process: ChildProcess | null;
  lastUsed: Date;
  createdAt: Date;
  tokenUsage: number;
  tasksCompleted: number;
  context: SessionContext;
  status: 'idle' | 'busy' | 'expired' | 'error';
}

const DEFAULT_CONFIG: SessionConfig = {
  timeout: 1800000,
  maxTokenUsage: 100000,
  keepAlive: true,
  maxSessions: 10,
};

export class AISessionManager {
  private sessions: Map<string, AISession> = new Map();
  private config: SessionConfig;
  private adapters: Map<string, AIAdapter>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(adapters: Map<string, AIAdapter>, config?: Partial<SessionConfig>) {
    this.adapters = adapters;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.keepAlive) {
      this.startCleanupInterval();
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  getSession(sessionId: string): AISession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): AISession[] {
    return Array.from(this.sessions.values());
  }

  async getOrCreateSession(adapter: string, context: SessionContext = {}): Promise<AISession> {
    const existingSession = this.findAvailableSession(adapter, context);
    if (existingSession) {
      existingSession.lastUsed = new Date();
      return existingSession;
    }

    if (this.sessions.size >= this.config.maxSessions) {
      this.cleanupOldest();
    }

    return this.createSession(adapter, context);
  }

  private findAvailableSession(adapter: string, context: SessionContext): AISession | undefined {
    for (const session of this.sessions.values()) {
      if (session.adapter === adapter && 
          session.status === 'idle' && 
          !this.isExpired(session) &&
          this.contextMatches(session.context, context)) {
        return session;
      }
    }
    return undefined;
  }

  private contextMatches(a: SessionContext, b: SessionContext): boolean {
    return a.cwd === b.cwd && 
           a.projectRoot === b.projectRoot;
  }

  private isExpired(session: AISession): boolean {
    return Date.now() - session.lastUsed.getTime() > this.config.timeout;
  }

  private async createSession(adapter: string, context: SessionContext): Promise<AISession> {
    const adapterConfig = this.adapters.get(adapter);
    if (!adapterConfig) {
      throw new Error(`Adapter not found: ${adapter}`);
    }

    const sessionId = `${adapter}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const session: AISession = {
      id: sessionId,
      adapter,
      process: null,
      lastUsed: new Date(),
      createdAt: new Date(),
      tokenUsage: 0,
      tasksCompleted: 0,
      context,
      status: 'idle',
    };

    this.sessions.set(sessionId, session);

    audit.securityAction('AI_SESSION', `${adapter}:${sessionId}`, 'CREATED', 'unknown');

    return session;
  }

  async executeInSession(
    sessionId: string,
    prompt: string,
    timeout: number = 120000
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, output: '', error: `Session not found: ${sessionId}` };
    }

    if (session.status !== 'idle') {
      return { success: false, output: '', error: `Session is not idle: ${session.status}` };
    }

    session.status = 'busy';
    session.lastUsed = new Date();

    const adapter = this.adapters.get(session.adapter);
    if (!adapter) {
      session.status = 'error';
      return { success: false, output: '', error: `Adapter not found: ${session.adapter}` };
    }

    try {
      const cmdArray = adapter.buildCommand(prompt, session.context as Record<string, unknown>, { timeout });
      const cmdString = cmdArray.join(' ');

      const result = await this.runCommand(cmdString, timeout);
      
      session.status = 'idle';
      session.tasksCompleted++;
      session.tokenUsage += result.length;

      return { success: true, output: result };
    } catch (error) {
      session.status = 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, output: '', error: errorMessage };
    }
  }

  private runCommand(cmd: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', cmd], { timeout });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  keepAlive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.lastUsed = new Date();
    return true;
  }

  cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.process && !session.process.killed) {
        session.process.kill();
      }
      this.sessions.delete(sessionId);
      audit.securityAction('AI_SESSION', `${session.adapter}:${sessionId}`, 'CLEANED_UP', 'unknown');
    }
  }

  cleanupExpired(): void {
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) {
        this.cleanup(id);
      }
    }
  }

  cleanupOldest(): void {
    let oldest: AISession | null = null;
    for (const session of this.sessions.values()) {
      if (!oldest || session.lastUsed < oldest.lastUsed) {
        oldest = session;
      }
    }
    if (oldest) {
      this.cleanup(oldest.id);
    }
  }

  cleanupAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.cleanup(sessionId);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalTokenUsage: number;
    totalTasksCompleted: number;
  } {
    let activeSessions = 0;
    let totalTokenUsage = 0;
    let totalTasksCompleted = 0;

    for (const session of this.sessions.values()) {
      if (session.status === 'idle' || session.status === 'busy') {
        activeSessions++;
      }
      totalTokenUsage += session.tokenUsage;
      totalTasksCompleted += session.tasksCompleted;
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      totalTokenUsage,
      totalTasksCompleted,
    };
  }
}

export function createSessionManager(
  adapters: Map<string, AIAdapter>,
  config?: Partial<SessionConfig>
): AISessionManager {
  return new AISessionManager(adapters, config);
}
