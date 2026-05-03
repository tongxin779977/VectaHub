import { describe, it, expect } from 'vitest';
import { createSessionManager } from './session-manager.js';

describe('Session Manager', () => {
  it('creates a new session', () => {
    const manager = createSessionManager({
      sessionTimeout: 60000,
      idleTimeout: 30000,
    });

    const session = manager.getOrCreateSession('openai', { model: 'gpt-4' });
    expect(session.id).toBeDefined();
    expect(session.tool).toBe('openai');
    expect(session.requestCount).toBe(1);
  });

  it('reuses existing session for same tool and config', () => {
    const manager = createSessionManager({
      sessionTimeout: 60000,
      idleTimeout: 30000,
    });

    const session1 = manager.getOrCreateSession('openai', { model: 'gpt-4' });
    const session2 = manager.getOrCreateSession('openai', { model: 'gpt-4' });

    expect(session1.id).toBe(session2.id);
    expect(session2.requestCount).toBe(2);
  });

  it('creates new session for different tool', () => {
    const manager = createSessionManager({
      sessionTimeout: 60000,
      idleTimeout: 30000,
    });

    const session1 = manager.getOrCreateSession('openai', { model: 'gpt-4' });
    const session2 = manager.getOrCreateSession('anthropic', { model: 'claude' });

    expect(session1.id).not.toBe(session2.id);
  });

  it('releases session', () => {
    const manager = createSessionManager({
      sessionTimeout: 60000,
      idleTimeout: 30000,
    });

    const session = manager.getOrCreateSession('openai', { model: 'gpt-4' });
    manager.releaseSession(session.id);
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  it('cleans up all sessions', () => {
    const manager = createSessionManager({
      sessionTimeout: 60000,
      idleTimeout: 30000,
    });

    manager.getOrCreateSession('openai', { model: 'gpt-4' });
    manager.getOrCreateSession('anthropic', { model: 'claude' });
    
    manager.cleanupAllSessions();
    expect(manager.getActiveSessionCount()).toBe(0);
  });
});
