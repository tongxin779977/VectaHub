import type { SessionManager } from '../nl/session-manager.js';

export interface ContextBuilderResult {
  cwd: string;
  history?: Array<{ role: string; content: string }>;
  projectContext?: Record<string, unknown>;
  userPreferences?: Record<string, unknown>;
  recentActions?: Array<Record<string, unknown>>;
  enhancedPrompt?: string;
}

export function createContextBuilder(sessionManager?: SessionManager | null) {
  return {
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
        projectContext: session.projectContext as unknown as Record<string, unknown>,
        userPreferences: session.userPreferences as unknown as Record<string, unknown>,
        recentActions: session.recentActions as unknown as Array<Record<string, unknown>>,
        enhancedPrompt: enhancedPrompt || undefined,
      };
    },
  };
}
