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

export class SessionManager {
  private sessions: Map<string, SessionContext> = new Map();
  private defaultUserPreferences: UserPreferences = {
    executionMode: 'relaxed',
    preferredTools: [],
    verbose: false,
    autoConfirm: false,
  };

  createSession(sessionId: string): SessionContext {
    const defaultProjectContext = this.getSyncDefaultProjectContext();
    const context: SessionContext = {
      sessionId,
      history: [],
      userPreferences: { ...this.defaultUserPreferences },
      projectContext: defaultProjectContext,
      recentActions: [],
    };
    this.sessions.set(sessionId, context);
    // 异步刷新完整的项目上下文
    this.refreshProjectContext(sessionId).catch(() => {});
    return context;
  }

  private getSyncDefaultProjectContext(): ProjectContext {
    const cwd = process.cwd();
    return { cwd };
  }

  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
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
    // 保留最近 50 条消息
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
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
    // 保留最近 20 条操作
    if (session.recentActions.length > 20) {
      session.recentActions = session.recentActions.slice(0, 20);
    }
  }

  updateUserPreferences(sessionId: string, preferences: Partial<UserPreferences>): void {
    const session = this.getOrCreateSession(sessionId);
    session.userPreferences = {
      ...session.userPreferences,
      ...preferences,
    };
  }

  updateProjectContext(sessionId: string, projectContext: Partial<ProjectContext>): void {
    const session = this.getOrCreateSession(sessionId);
    session.projectContext = {
      ...session.projectContext,
      ...projectContext,
    };
  }

  async refreshProjectContext(sessionId: string): Promise<void> {
    const context = await this.getDefaultProjectContext();
    this.updateProjectContext(sessionId, context);
  }

  private async getDefaultProjectContext(): Promise<ProjectContext> {
    const cwd = process.cwd();
    let gitStatus;
    let packageJson;

    // 尝试获取 Git 状态
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

    // 尝试获取 package.json
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

    // 添加项目上下文
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

    // 添加用户偏好
    prompt += '\n## 用户偏好\n';
    prompt += `- 执行模式: ${session.userPreferences.executionMode}\n`;
    if (session.userPreferences.preferredTools.length > 0) {
      prompt += `- 偏好工具: ${session.userPreferences.preferredTools.join(', ')}\n`;
    }
    prompt += `- 详细输出: ${session.userPreferences.verbose ? '是' : '否'}\n`;
    prompt += `- 自动确认: ${session.userPreferences.autoConfirm ? '是' : '否'}\n`;

    // 添加最近操作
    if (session.recentActions.length > 0) {
      prompt += '\n## 最近操作\n';
      const recent = session.recentActions.slice(0, 5);
      for (const action of recent) {
        prompt += `- [${action.timestamp.toLocaleTimeString()}] ${action.description}\n`;
      }
    }

    // 添加历史对话（最近 5 条）
    if (session.history.length > 0) {
      prompt += '\n## 历史对话\n';
      const recentHistory = session.history.slice(-5);
      for (const msg of recentHistory) {
        const prefix = msg.role === 'user' ? '用户' : '助手';
        prompt += `${prefix}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`;
      }
    }

    return prompt;
  }
}

export function createSessionManager(): SessionManager {
  return new SessionManager();
}
