/**
 * 会话上下文构建器。
 * 从 `SessionManager` 聚合项目上下文、历史记录和用户偏好，
 * 为 LLM prompt 提供结构化的上下文信息。
 * @module chat/context-builder
 */
import type { SessionManager } from '../nl/session-manager.js';
import type { ProjectContext, UserPreferences, RecentAction, Message } from '../types/index.js';

/**
 * 上下文构建结果，包含会话相关的所有上下文维度。
 */
export interface ContextBuilderResult {
  /** 当前工作目录 */
  cwd: string;
  /** 会话历史消息 */
  history?: Message[];
  /** 项目上下文（Git 状态、package.json 等） */
  projectContext?: ProjectContext;
  /** 用户偏好设置 */
  userPreferences?: UserPreferences;
  /** 最近操作记录 */
  recentActions?: RecentAction[];
  /** 上下文增强后的 prompt */
  enhancedPrompt?: string;
}

/**
 * 创建上下文构建器实例。
 *
 * @param sessionManager - 可选的会话管理器；为空时回退为仅返回 cwd
 * @returns 包含 `buildContext` 方法的对象
 */
export function createContextBuilder(sessionManager?: SessionManager | null) {
  return {
    /**
     * 构建当前会话的上下文信息。
     *
     * @param sessionId - 会话标识符
     * @returns 上下文构建结果
     */
    async buildContext(sessionId?: string): Promise<ContextBuilderResult> {
      if (!sessionManager || !sessionId) {
        return { cwd: process.cwd() };
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return { cwd: process.cwd() };
      }

      const enhancedPrompt = sessionManager.buildContextAwarePrompt('', sessionId);

      return {
        cwd: session.projectContext.cwd,
        history: session.history,
        projectContext: session.projectContext,
        userPreferences: session.userPreferences,
        recentActions: session.recentActions,
        enhancedPrompt: enhancedPrompt || undefined,
      };
    },
  };
}
