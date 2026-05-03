import { AISession } from './types.js';

export interface SessionManagerOptions {
  sessionTimeout: number;
  idleTimeout: number;
}

export interface SessionManager {
  getOrCreateSession(tool: string, config: Record<string, unknown>): AISession;
  releaseSession(sessionId: string): void;
  cleanupIdleSessions(): number;
  cleanupAllSessions(): void;
  getActiveSessionCount(): number;
}

let sessionCounter = 0;

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const sessions = new Map<string, AISession>();
  const { sessionTimeout, idleTimeout } = options;

  return {
    getOrCreateSession(tool: string, config: Record<string, unknown>): AISession {
      const now = new Date();

      for (const [id, session] of sessions) {
        if (session.tool === tool && JSON.stringify(session.config) === JSON.stringify(config)) {
          if (now.getTime() - session.lastUsedAt.getTime() > sessionTimeout) {
            sessions.delete(id);
            continue;
          }
          session.lastUsedAt = now;
          session.requestCount++;
          return session;
        }
      }

      const session: AISession = {
        id: `session_${++sessionCounter}`,
        tool,
        config,
        createdAt: now,
        lastUsedAt: now,
        requestCount: 1,
      };

      sessions.set(session.id, session);
      return session;
    },

    releaseSession(sessionId: string): void {
      sessions.delete(sessionId);
    },

    cleanupIdleSessions(): number {
      const now = Date.now();
      let removed = 0;

      for (const [id, session] of sessions) {
        if (now - session.lastUsedAt.getTime() > idleTimeout) {
          sessions.delete(id);
          removed++;
        }
      }

      return removed;
    },

    cleanupAllSessions(): void {
      sessions.clear();
    },

    getActiveSessionCount(): number {
      return sessions.size;
    },
  };
}
