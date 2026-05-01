import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AISessionManager, createSessionManager } from './session-manager.js';
import { GEMINI_ADAPTER, CLAUDE_ADAPTER, CODEX_ADAPTER, AIDER_ADAPTER } from './ai-delegate.js';

describe('AISessionManager', () => {
  let manager: AISessionManager;
  let adapters: Map<string, typeof GEMINI_ADAPTER>;

  beforeEach(() => {
    adapters = new Map([
      ['gemini', GEMINI_ADAPTER],
      ['claude', CLAUDE_ADAPTER],
      ['codex', CODEX_ADAPTER],
      ['aider', AIDER_ADAPTER],
    ]);
    manager = createSessionManager(adapters, { maxSessions: 5 });
  });

  afterEach(() => {
    manager.cleanupAll();
  });

  describe('session creation', () => {
    it('should create a new session', async () => {
      const session = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      
      expect(session).toBeDefined();
      expect(session.id).toContain('claude');
      expect(session.adapter).toBe('claude');
      expect(session.status).toBe('idle');
    });

    it('should reuse existing session with same context', async () => {
      const session1 = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      const session2 = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      
      expect(session1.id).toBe(session2.id);
    });

    it('should create different sessions for different adapters', async () => {
      const claudeSession = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      const geminiSession = await manager.getOrCreateSession('gemini', { cwd: '/tmp' });
      
      expect(claudeSession.id).not.toBe(geminiSession.id);
      expect(claudeSession.adapter).toBe('claude');
      expect(geminiSession.adapter).toBe('gemini');
    });
  });

  describe('session management', () => {
    it('should list all sessions', async () => {
      await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      await manager.getOrCreateSession('gemini', { cwd: '/tmp' });
      
      const sessions = manager.listSessions();
      expect(sessions.length).toBe(2);
    });

    it('should get session by id', async () => {
      const session = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      
      const retrieved = manager.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
    });

    it('should return undefined for non-existent session', () => {
      const session = manager.getSession('non-existent');
      expect(session).toBeUndefined();
    });

    it('should cleanup a session', async () => {
      const session = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      
      manager.cleanup(session.id);
      
      const retrieved = manager.getSession(session.id);
      expect(retrieved).toBeUndefined();
    });

    it('should cleanup all sessions', async () => {
      await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      await manager.getOrCreateSession('gemini', { cwd: '/tmp' });
      
      manager.cleanupAll();
      
      const sessions = manager.listSessions();
      expect(sessions.length).toBe(0);
    });
  });

  describe('session limits', () => {
    it('should cleanup oldest session when max sessions reached', async () => {
      const smallManager = createSessionManager(adapters, { maxSessions: 2 });
      
      const session1 = await smallManager.getOrCreateSession('claude', { cwd: '/tmp/1' });
      await smallManager.getOrCreateSession('gemini', { cwd: '/tmp/2' });
      await smallManager.getOrCreateSession('codex', { cwd: '/tmp/3' });
      
      const retrieved = smallManager.getSession(session1.id);
      expect(retrieved).toBeUndefined();
      
      smallManager.cleanupAll();
    });
  });

  describe('keep alive', () => {
    it('should update lastUsed on keepAlive', async () => {
      const session = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      const originalLastUsed = session.lastUsed;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = manager.keepAlive(session.id);
      
      expect(result).toBe(true);
      expect(session.lastUsed.getTime()).toBeGreaterThan(originalLastUsed.getTime());
    });

    it('should return false for non-existent session', () => {
      const result = manager.keepAlive('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('stats', () => {
    it('should return correct stats', async () => {
      await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      await manager.getOrCreateSession('gemini', { cwd: '/tmp' });
      
      const stats = manager.getStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
    });
  });

  describe('executeInSession', () => {
    it('should return error for non-existent session', async () => {
      const result = await manager.executeInSession('non-existent', 'test prompt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should return error for busy session', async () => {
      const session = await manager.getOrCreateSession('claude', { cwd: '/tmp' });
      session.status = 'busy';
      
      const result = await manager.executeInSession(session.id, 'test prompt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Session is not idle');
    });
  });
});
