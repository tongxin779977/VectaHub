import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  SessionContext,
  Message,
  UserPreferences,
  ProjectContext,
  RecentAction,
} from '../types/index.js';

const execAsync = promisify(exec);

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionManagerOptions {
  sessionTimeoutMs?: number;
  cleanupIntervalMs?: number;
  maxSessions?: number;
}

export class SessionManager {
  private sessions: Map<string, { context: SessionContext; lastActivity: number }> = new Map();
  private defaultUserPreferences: UserPreferences = {
    executionMode: 'relaxed',
    preferredTools: [],
    verbose: false,
    autoConfirm: false,
  };
  private sessionTimeoutMs: number;
  private cleanupIntervalMs: number;
  private maxSessions: number;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private onSessionExpired?: (sessionId: string) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.maxSessions = options.maxSessions ?? 50;
    this.startCleanupScheduler();
  }

  private startCleanupScheduler(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupIntervalMs);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    
    for (const [sessionId, data] of this.sessions) {
      if (now - data.lastActivity > this.sessionTimeoutMs) {
        this.sessions.delete(sessionId);
        this.onSessionExpired?.(sessionId);
      }
    }
  }

  setSessionExpiredCallback(callback: (sessionId: string) => void): void {
    this.onSessionExpired = callback;
  }

  createSession(sessionId: string): SessionContext {
    this.enforceMaxSessions();
    
    const defaultProjectContext = this.getSyncDefaultProjectContext();
    const context: SessionContext = {
      sessionId,
      history: [],
      userPreferences: { ...this.defaultUserPreferences },
      projectContext: defaultProjectContext,
      recentActions: [],
    };
    this.sessions.set(sessionId, { context, lastActivity: Date.now() });
    this.refreshProjectContext(sessionId).catch(() => {});
    return context;
  }

  private enforceMaxSessions(): void {
    if (this.sessions.size >= this.maxSessions) {
      const oldestSession = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
      
      if (oldestSession) {
        this.sessions.delete(oldestSession[0]);
        this.onSessionExpired?.(oldestSession[0]);
      }
    }
  }

  private updateActivity(sessionId: string): void {
    const data = this.sessions.get(sessionId);
    if (data) {
      data.lastActivity = Date.now();
    }
  }

  private getSyncDefaultProjectContext(): ProjectContext {
    const cwd = process.cwd();
    return { cwd };
  }

  getSession(sessionId: string): SessionContext | undefined {
    const data = this.sessions.get(sessionId);
    if (data) {
      this.updateActivity(sessionId);
      return data.context;
    }
    return undefined;
  }

  getOrCreateSession(sessionId: string): SessionContext {
    let session = this.getSession(sessionId);
    if (!session) {
      session = this.createSession(sessionId);
    }
    return session;
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.getOrCreateSession(sessionId);
    session.history.push(message);
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
    this.updateActivity(sessionId);
  }

  addUserMessage(sessionId: string, content: string): void {
    this.addMessage(sessionId, { role: 'user', content });
  }

  addAssistantMessage(sessionId: string, content: string): void {
    this.addMessage(sessionId, { role: 'assistant', content });
  }

  addRecentAction(sessionId: string, action: Omit<RecentAction, 'timestamp'>): void {
    const session = this.getOrCreateSession(sessionId);
    session.recentActions.unshift({
      ...action,
      timestamp: new Date(),
    });
    if (session.recentActions.length > 20) {
      session.recentActions = session.recentActions.slice(0, 20);
    }
    this.updateActivity(sessionId);
  }

  updateUserPreferences(sessionId: string, preferences: Partial<UserPreferences>): void {
    const session = this.getOrCreateSession(sessionId);
    session.userPreferences = {
      ...session.userPreferences,
      ...preferences,
    };
    this.updateActivity(sessionId);
  }

  updateProjectContext(sessionId: string, projectContext: Partial<ProjectContext>): void {
    const session = this.getOrCreateSession(sessionId);
    session.projectContext = {
      ...session.projectContext,
      ...projectContext,
    };
    this.updateActivity(sessionId);
  }

  async refreshProjectContext(sessionId: string): Promise<void> {
    const context = await this.getDefaultProjectContext();
    this.updateProjectContext(sessionId, context);
  }

  private async getDefaultProjectContext(): Promise<ProjectContext> {
    const cwd = process.cwd();
    let gitStatus;
    let packageJson;

    try {
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd });
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });
      
      const modified: string[] = [];
      const staged: string[] = [];
      
      for (const line of statusOutput.trim().split('\n')) {
        if (!line) continue;
        const status = line.substring(0, 2);
        const file = line.substring(3);
        if (status.includes('M') || status.includes('A')) {
          if (status.startsWith(' ')) {
            modified.push(file);
          } else {
            staged.push(file);
          }
        }
      }
      
      gitStatus = {
        branch: branchOutput.trim(),
        modified,
        staged,
      };
    } catch {
      // Git 不可用，忽略
    }

    const packagePath = join(cwd, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const { readFile } = await import('fs/promises');
        const content = await readFile(packagePath, 'utf-8');
        packageJson = JSON.parse(content);
      } catch {
        // package.json 解析失败，忽略
      }
    }

    return {
      cwd,
      gitStatus,
      packageJson,
    };
  }

  buildContextAwarePrompt(basePrompt: string, sessionId: string): string {
    const session = this.getOrCreateSession(sessionId);
    let prompt = basePrompt;

    prompt += '\n\n## 当前项目上下文\n';
    prompt += `- 工作目录: ${session.projectContext.cwd}\n`;
    if (session.projectContext.gitStatus) {
      prompt += `- Git 分支: ${session.projectContext.gitStatus.branch}\n`;
      if (session.projectContext.gitStatus.modified.length > 0) {
        prompt += `- 修改文件: ${session.projectContext.gitStatus.modified.length} 个\n`;
      }
      if (session.projectContext.gitStatus.staged.length > 0) {
        prompt += `- 暂存文件: ${session.projectContext.gitStatus.staged.length} 个\n`;
      }
    }
    if (session.projectContext.packageJson && 'name' in session.projectContext.packageJson) {
      prompt += `- 项目名称: ${session.projectContext.packageJson.name}\n`;
    }

    prompt += '\n## 用户偏好\n';
    prompt += `- 执行模式: ${session.userPreferences.executionMode}\n`;
    if (session.userPreferences.preferredTools.length > 0) {
      prompt += `- 偏好工具: ${session.userPreferences.preferredTools.join(', ')}\n`;
    }
    prompt += `- 详细输出: ${session.userPreferences.verbose ? '是' : '否'}\n`;
    prompt += `- 自动确认: ${session.userPreferences.autoConfirm ? '是' : '否'}\n`;

    if (session.recentActions.length > 0) {
      prompt += '\n## 最近操作\n';
      const recent = session.recentActions.slice(0, 5);
      for (const action of recent) {
        prompt += `- [${action.timestamp.toLocaleTimeString()}] ${action.description}\n`;
      }
    }

    return prompt;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getSessionActivity(sessionId: string): number | undefined {
    const data = this.sessions.get(sessionId);
    return data?.lastActivity;
  }

  isSessionActive(sessionId: string): boolean {
    const activity = this.getSessionActivity(sessionId);
    if (activity === undefined) return false;
    return Date.now() - activity <= this.sessionTimeoutMs;
  }

  shutdown(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.sessions.clear();
  }

  setTimeout(timeoutMs: number): void {
    this.sessionTimeoutMs = timeoutMs;
  }

  getTimeout(): number {
    return this.sessionTimeoutMs;
  }
}

export function createSessionManager(options?: SessionManagerOptions): SessionManager {
  return new SessionManager(options);
}