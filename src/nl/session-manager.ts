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
import { getLogger } from '../infrastructure/logger/index.js';
import type { Logger } from '../infrastructure/logger/index.js';

const execAsync = promisify(exec);

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 50;
const TOKEN_LIMIT = 8000;
const CHARS_PER_TOKEN = 4;
const L1_WINDOW_ROUNDS = 5;

export interface MemoryLayer {
  getContent(): string;
  getTokenEstimate(): number;
  refresh(): Promise<void>;
}

export interface SessionManagerOptions {
  sessionTimeoutMs?: number;
  cleanupIntervalMs?: number;
  maxSessions?: number;
  l1WindowRounds?: number;
  logger?: Logger;
}

interface MemoryLayers {
  l1: WorkingMemory;
  l2: SessionSummary;
  l3: ProjectContextMemory;
}

function estimateTokensFromText(text: string): number {
  let count = 0;
  for (const ch of text) {
    count += ch.charCodeAt(0) > 0x7f ? 1 : 1 / CHARS_PER_TOKEN;
  }
  return Math.ceil(count);
}

class WorkingMemory implements MemoryLayer {
  private messages: Message[] = [];
  private windowRounds: number;

  constructor(windowRounds: number = L1_WINDOW_ROUNDS) {
    this.windowRounds = windowRounds;
  }

  getContent(): string {
    return this.messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n');
  }

  getTokenEstimate(): number {
    return this.messages.reduce(
      (sum, m) => sum + estimateTokensFromText(m.content),
      0
    );
  }

  refresh(): Promise<void> {
    return Promise.resolve();
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getWindowSize(): number {
    return this.windowRounds;
  }

  trimToWindow(allHistory: Message[]): Message[] {
    if (allHistory.length <= this.windowRounds * 2) {
      this.messages = [...allHistory];
    } else {
      this.messages = allHistory.slice(-(this.windowRounds * 2));
    }
    return this.messages;
  }

  clear(): void {
    this.messages = [];
  }
}

class SessionSummary implements MemoryLayer {
  private summaryText: string = '';
  private summarizedCount: number = 0;

  getContent(): string {
    return this.summaryText;
  }

  getTokenEstimate(): number {
    return estimateTokensFromText(this.summaryText);
  }

  refresh(): Promise<void> {
    return Promise.resolve();
  }

  summarize(messages: Message[]): string {
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

    let result = `[对话摘要: ${messages.length} 条消息]`;
    if (topics.length > 0) {
      result += `\n用户话题: ${topics.slice(0, 3).join('; ')}`;
    }
    if (actions.length > 0) {
      result += `\n助手响应: ${actions.slice(0, 3).join('; ')}`;
    }

    this.summaryText = result;
    this.summarizedCount += messages.length;
    return result;
  }

  appendSummary(newMessages: Message[]): string {
    const newSummary = this.buildSummary(newMessages);

    if (this.summaryText) {
      const existing = this.summaryText.replace(
        /\[对话摘要: (\d+) 条消息\]/,
        (_, count) => `[对话摘要: ${Number(count) + newMessages.length} 条消息]`
      );
      this.summaryText = `${existing}\n${newSummary}`;
    } else {
      this.summaryText = newSummary;
    }

    this.summarizedCount += newMessages.length;
    return this.summaryText;
  }

  private buildSummary(messages: Message[]): string {
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

    let result = '';
    if (topics.length > 0) {
      result += `用户话题: ${topics.slice(0, 3).join('; ')}`;
    }
    if (actions.length > 0) {
      result += (result ? '\n' : '') + `助手响应: ${actions.slice(0, 3).join('; ')}`;
    }

    return result;
  }

  getSummarizedCount(): number {
    return this.summarizedCount;
  }

  hasContent(): boolean {
    return this.summaryText.length > 0;
  }

  clear(): void {
    this.summaryText = '';
    this.summarizedCount = 0;
  }
}

class ProjectContextMemory implements MemoryLayer {
  private context: ProjectContext;
  private logger: Logger;

  constructor(context: ProjectContext, logger: Logger) {
    this.context = context;
    this.logger = logger;
  }

  getContent(): string {
    const lines: string[] = [`工作目录: ${this.context.cwd}`];

    if (this.context.gitStatus) {
      lines.push(`Git 分支: ${this.context.gitStatus.branch}`);
      if (this.context.gitStatus.modified.length > 0) {
        lines.push(`修改文件: ${this.context.gitStatus.modified.length} 个`);
      }
      if (this.context.gitStatus.staged.length > 0) {
        lines.push(`暂存文件: ${this.context.gitStatus.staged.length} 个`);
      }
    }

    if (this.context.packageJson && 'name' in this.context.packageJson) {
      lines.push(`项目名称: ${this.context.packageJson.name}`);
    }

    return lines.join('\n');
  }

  getTokenEstimate(): number {
    return estimateTokensFromText(this.getContent());
  }

  async refresh(): Promise<void> {
    const updated = await ProjectContextMemory.fetchProjectContext(this.context.cwd, this.logger);
    if (updated.gitStatus) this.context.gitStatus = updated.gitStatus;
    if (updated.packageJson) this.context.packageJson = updated.packageJson;
  }

  update(partial: Partial<ProjectContext>): void {
    if (partial.cwd !== undefined) this.context.cwd = partial.cwd;
    if (partial.gitStatus !== undefined) this.context.gitStatus = partial.gitStatus;
    if (partial.packageJson !== undefined) this.context.packageJson = partial.packageJson;
    if (partial.configFiles !== undefined) this.context.configFiles = partial.configFiles;
  }

  getContext(): ProjectContext {
    return this.context;
  }

  static async fetchProjectContext(cwd: string, logger?: Logger): Promise<ProjectContext> {
    let gitStatus: ProjectContext['gitStatus'];
    let packageJson: ProjectContext['packageJson'];
    const localLogger = logger ?? getLogger('session-manager');

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

      gitStatus = { branch: branchOutput.trim(), modified, staged };
    } catch (error) {
      localLogger.debug(`Git unavailable in ${cwd}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const packagePath = join(cwd, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const { readFile } = await import('fs/promises');
        const content = await readFile(packagePath, 'utf-8');
        packageJson = JSON.parse(content);
      } catch (error) {
        localLogger.warn(`Failed to parse package.json at ${packagePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { cwd, gitStatus, packageJson };
  }
}

export class SessionManager {
  private lifecycle: LifecycleManager<SessionContext>;
  private memoryLayers: Map<string, MemoryLayers> = new Map();
  private defaultUserPreferences: UserPreferences = {
    executionMode: 'relaxed',
    preferredTools: [],
    verbose: false,
    autoConfirm: false,
  };
  private onSessionExpired?: (sessionId: string) => void;
  private l1WindowRounds: number;
  private logger: Logger;

  constructor(options: SessionManagerOptions = {}) {
    this.l1WindowRounds = options.l1WindowRounds ?? L1_WINDOW_ROUNDS;
    this.logger = options.logger ?? getLogger('session-manager');
    this.lifecycle = new LifecycleManager<SessionContext>({
      ttl: options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
      maxCount: options.maxSessions ?? 50,
      cleanupInterval: options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
      onEvicted: (sessionId) => {
        this.memoryLayers.delete(sessionId);
        this.onSessionExpired?.(sessionId);
      },
    });
  }

  private createMemoryLayers(sessionId: string): MemoryLayers {
    const existing = this.memoryLayers.get(sessionId);
    if (existing) return existing;

    const cwd = process.cwd();
    const layers: MemoryLayers = {
      l1: new WorkingMemory(this.l1WindowRounds),
      l2: new SessionSummary(),
      l3: new ProjectContextMemory({ cwd }, this.logger),
    };
    this.memoryLayers.set(sessionId, layers);
    return layers;
  }

  private getMemoryLayers(sessionId: string): MemoryLayers | undefined {
    return this.memoryLayers.get(sessionId);
  }

  setSessionExpiredCallback(callback: (sessionId: string) => void): void {
    this.onSessionExpired = callback;
  }

  createSession(sessionId: string): SessionContext {
    const defaultProjectContext = { cwd: process.cwd() };
    const context: SessionContext = {
      sessionId,
      history: [],
      userPreferences: { ...this.defaultUserPreferences },
      projectContext: defaultProjectContext,
      recentActions: [],
    };
    this.createMemoryLayers(sessionId);
    this.lifecycle.set(sessionId, context);
    this.refreshProjectContext(sessionId).catch(() => {});
    return context;
  }

  private updateActivity(sessionId: string): void {
    this.lifecycle.updateActivity(sessionId);
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

    const layers = this.createMemoryLayers(sessionId);
    layers.l1.addMessage(message);

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
    return estimateTokensFromText(text);
  }

  getSessionTokenCount(sessionId: string): number {
    const session = this.getSession(sessionId);
    if (!session) return 0;
    return session.history.reduce(
      (sum, msg) => sum + estimateTokensFromText(msg.content),
      0
    );
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
    const keepCount = Math.min(10, Math.floor(session.history.length / 3));

    if (session.history.length <= keepCount * 2 && totalTokens <= TOKEN_LIMIT) {
      return;
    }

    const toSummarize = session.history.slice(0, -keepCount * 2);
    const toKeep = session.history.slice(-keepCount * 2);

    const layers = this.getMemoryLayers(sessionId);
    if (layers) {
      if (layers.l2.hasContent()) {
        layers.l2.appendSummary(toSummarize);
      } else {
        layers.l2.summarize(toSummarize);
      }
      layers.l1.trimToWindow(session.history);
    }

    const summary = this.summarizeHistory(toSummarize);
    session.history = [
      { role: 'assistant', content: summary },
      ...toKeep,
    ];
  }

  getFormattedContext(sessionId: string): string {
    const layers = this.getMemoryLayers(sessionId);
    if (!layers) return '';

    const parts: string[] = [];

    const l3Content = layers.l3.getContent();
    if (l3Content) {
      parts.push(`[L3 项目上下文]\n${l3Content}`);
    }

    const l2Content = layers.l2.getContent();
    if (l2Content) {
      parts.push(`[L2 会话摘要]\n${l2Content}`);
    }

    const l1Content = layers.l1.getContent();
    if (l1Content) {
      parts.push(`[L1 工作记忆]\n${l1Content}`);
    }

    return parts.join('\n\n');
  }

  getTokenBreakdown(sessionId: string): { l1: number; l2: number; l3: number; total: number } {
    const layers = this.getMemoryLayers(sessionId);
    if (!layers) return { l1: 0, l2: 0, l3: 0, total: 0 };

    const l1 = layers.l1.getTokenEstimate();
    const l2 = layers.l2.getTokenEstimate();
    const l3 = layers.l3.getTokenEstimate();

    return { l1, l2, l3, total: l1 + l2 + l3 };
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

    const layers = this.getMemoryLayers(sessionId);
    if (layers) {
      layers.l3.update(projectContext);
    }
    this.updateActivity(sessionId);
  }

  updateLastWorkflow(sessionId: string, workflowId: string, yaml: string): void {
    const session = this.getOrCreateSession(sessionId);
    session.lastWorkflowId = workflowId;
    session.lastWorkflowYaml = yaml;
    this.updateActivity(sessionId);
  }

  async refreshProjectContext(sessionId: string): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    const context = await ProjectContextMemory.fetchProjectContext(
      session.projectContext.cwd,
      this.logger
    );
    this.updateProjectContext(sessionId, context);

    const layers = this.getMemoryLayers(sessionId);
    if (layers) {
      layers.l3.refresh();
    }
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
    this.memoryLayers.delete(sessionId);
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
    this.memoryLayers.clear();
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
