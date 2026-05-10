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
import { LifecycleManager } from '../utils/lifecycle-manager.js';

const execAsync = promisify(exec);

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 50;
const TOKEN_LIMIT = 8000;
const SUMMARY_THRESHOLD = 30;
const CHARS_PER_TOKEN = 4;

export interface SessionManagerOptions {
  sessionTimeoutMs?: number;
  cleanupIntervalMs?: number;
  maxSessions?: number;
}

export class SessionManager {
  private lifecycle: LifecycleManager<SessionContext>;
  private defaultUserPreferences: UserPreferences = {
    executionMode: 'relaxed',
    preferredTools: [],
    verbose: false,
    autoConfirm: false,
  };
  private onSessionExpired?: (sessionId: string) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.lifecycle = new LifecycleManager<SessionContext>({
      ttl: options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
      maxCount: options.maxSessions ?? 50,
      cleanupInterval: options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
      onEvicted: (sessionId) => {
        this.onSessionExpired?.(sessionId);
      },
    });
  }

  setSessionExpiredCallback(callback: (sessionId: string) => void): void {
    this.onSessionExpired = callback;
  }

  createSession(sessionId: string): SessionContext {
    const defaultProjectContext = this.getSyncDefaultProjectContext();
    const context: SessionContext = {
      sessionId,
      history: [],
      userPreferences: { ...this.defaultUserPreferences },
      projectContext: defaultProjectContext,
      recentActions: [],
    };
    this.lifecycle.set(sessionId, context);
    this.refreshProjectContext(sessionId).catch(() => {});
    return context;
  }

  private updateActivity(sessionId: string): void {
    this.lifecycle.updateActivity(sessionId);
  }

  private getSyncDefaultProjectContext(): ProjectContext {
    const cwd = process.cwd();
    return { cwd };
  }

  getSession(sessionId: string): SessionContext | undefined {
    return this.lifecycle.get(sessionId);
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
    if (session.history.length > MAX_HISTORY_MESSAGES) {
      this.compactHistory(sessionId);
    }
    this.updateActivity(sessionId);
  }

  addUserMessage(sessionId: string, content: string): void {
    this.addMessage(sessionId, { role: 'user', content });
  }

  addAssistantMessage(sessionId: string, content: string): void {
    this.addMessage(sessionId, { role: 'assistant', content });
  }

  estimateTokens(text: string): number {
    let count = 0;
    for (const ch of text) {
      count += ch.charCodeAt(0) > 0x7f ? 1 : 1 / CHARS_PER_TOKEN;
    }
    return Math.ceil(count);
  }

  getSessionTokenCount(sessionId: string): number {
    const session = this.getSession(sessionId);
    if (!session) return 0;
    return session.history.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
  }

  summarizeHistory(messages: Message[]): string {
    if (messages.length === 0) return '';

    const topics: string[] = [];
    const actions: string[] = [];

    for (const msg of messages) {
      const content = msg.content.slice(0, 200);
      if (msg.role === 'user') {
        topics.push(content);
      } else {
        actions.push(content.slice(0, 100));
      }
    }

    let summary = `[对话摘要: ${messages.length} 条消息]`;
    if (topics.length > 0) {
      summary += `\n用户话题: ${topics.slice(0, 3).join('; ')}`;
    }
    if (actions.length > 0) {
      summary += `\n助手响应: ${actions.slice(0, 3).join('; ')}`;
    }

    return summary;
  }

  compactHistory(sessionId: string): void {
    const session = this.getOrCreateSession(sessionId);
    const totalTokens = this.getSessionTokenCount(sessionId);

    if (session.history.length <= SUMMARY_THRESHOLD && totalTokens <= TOKEN_LIMIT) {
      return;
    }

    const keepCount = Math.min(10, Math.floor(session.history.length / 3));
    const toSummarize = session.history.slice(0, -keepCount);
    const toKeep = session.history.slice(-keepCount);

    const summary = this.summarizeHistory(toSummarize);
    session.history = [
      { role: 'assistant', content: summary },
      ...toKeep,
    ];
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

  updateLastWorkflow(sessionId: string, workflowId: string, yaml: string): void {
    const session = this.getOrCreateSession(sessionId);
    session.lastWorkflowId = workflowId;
    session.lastWorkflowYaml = yaml;
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
    this.lifecycle.delete(sessionId);
  }

  getAllSessionIds(): string[] {
    return this.lifecycle.keys();
  }

  getSessionCount(): number {
    return this.lifecycle.size();
  }

  getSessionActivity(sessionId: string): number | undefined {
    return this.lifecycle.getActivity(sessionId);
  }

  isSessionActive(sessionId: string): boolean {
    const activity = this.getSessionActivity(sessionId);
    if (activity === undefined) return false;
    return Date.now() - activity <= this.lifecycle.getTtl();
  }

  shutdown(): void {
    this.lifecycle.shutdown();
  }

  setTimeout(timeoutMs: number): void {
    this.lifecycle.setTtl(timeoutMs);
  }

  getTimeout(): number {
    return this.lifecycle.getTtl();
  }
}

export function createSessionManager(options?: SessionManagerOptions): SessionManager {
  return new SessionManager(options);
}