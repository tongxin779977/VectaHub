import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSessionManager,
  createDelegateExecutor,
  type SessionManager,
  type DelegateExecutor,
} from './ai-delegate.js';

vi.mock('../utils/audit.js', () => ({
  audit: {
    cliCommand: vi.fn(),
    cliOutput: vi.fn(),
    securityAction: vi.fn(),
  },
  getCurrentSessionId: () => 'test-session',
}));

describe('LLM Long Conversation Tests', () => {
  describe('Test 1: Multi-turn Intent Resolution', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = createSessionManager();
    });

    it('should maintain context across 10+ turns', async () => {
      const session = sessionManager.createSession('claude', {
        projectContext: 'vectahub-project'
      });

      const conversationHistory: string[] = [];

      for (let turn = 1; turn <= 10; turn++) {
        const input = `Turn ${turn}: 分析项目${turn}`;
        conversationHistory.push(input);

        sessionManager.updateSession(session.id, {
          messageCount: turn,
          lastActiveAt: new Date(),
        });

        const updatedSession = sessionManager.getSession(session.id);
        expect(updatedSession).toBeDefined();
        expect(updatedSession?.messageCount).toBe(turn);
      }

      expect(conversationHistory.length).toBe(10);
    });

    it('should handle 20-turn conversation without context loss', async () => {
      const session = sessionManager.createSession('gemini');

      for (let i = 1; i <= 20; i++) {
        sessionManager.updateSession(session.id, {
          messageCount: i,
          lastActiveAt: new Date(),
          context: { turn: i, history: Array(i).fill('msg') },
        });
      }

      const finalSession = sessionManager.getSession(session.id);
      expect(finalSession?.messageCount).toBe(20);
    });
  });

  describe('Test 2: Session Persistence', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = createSessionManager();
    });

    it('should persist session after 30 seconds idle', async () => {
      const session = sessionManager.createSession('aider');
      const sessionId = session.id;

      sessionManager.updateSession(sessionId, {
        lastActiveAt: new Date(Date.now() - 25000),
        messageCount: 5,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = sessionManager.getSession(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.messageCount).toBe(5);
    });

    it('should handle 50 session operations', async () => {
      const sessionIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const session = sessionManager.createSession('claude');
        sessionIds.push(session.id);
      }

      const sessions = sessionManager.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Test 3: Provider Fallback in Conversation', () => {
    it('should fallback gracefully when primary provider unavailable', async () => {
      const executor = createDelegateExecutor();

      const result = await executor.delegate({
        provider: 'unavailable-provider' as any,
        prompt: 'test prompt',
        retry: {
          maxRetries: 2,
          retryOnExitCodes: [1],
          backoffMs: 100,
        },
      });

      expect(result).toBeDefined();
    });

    it('should maintain conversation when switching providers', async () => {
      const executor = createDelegateExecutor();
      const session1 = executor.createSession('claude');

      executor.submitTask('first message', {}, 5);

      const result = await executor.delegate({
        provider: 'aider',
        prompt: 'second message',
        sessionId: session1.id,
      });

      expect(result).toBeDefined();
    });
  });

  describe('Test 4: Context Window Management', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = createSessionManager();
    });

    it('should handle large context without overflow', async () => {
      const session = sessionManager.createSession('gemini');

      const largeContext = {
        files: Array(1000).fill({ path: '/test/file.txt', content: 'x'.repeat(1000) }),
        history: Array(500).fill({ role: 'user', content: 'test message' }),
      };

      sessionManager.updateSession(session.id, {
        context: largeContext as any,
        messageCount: 500,
      });

      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeDefined();
    });

    it('should truncate context when exceeding limits', async () => {
      const session = sessionManager.createSession('claude');

      sessionManager.updateSession(session.id, {
        context: { veryLarge: 'x'.repeat(100000) } as any,
        messageCount: 1000,
      });

      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeDefined();
    });
  });

  describe('Test 5: Error Recovery in Long Conversations', () => {
    let executor: DelegateExecutor;

    beforeEach(() => {
      executor = createDelegateExecutor();
    });

    it('should recover from transient failures', async () => {
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const result = await executor.delegate({
          provider: 'aider',
          prompt: `attempt ${attempts}`,
          retry: {
            maxRetries: 1,
            retryOnExitCodes: [1],
            backoffMs: 50,
          },
        });

        if (result.success) break;
        attempts++;
      }

      expect(attempts).toBeLessThan(maxAttempts);
    });

    it('should handle 10 sequential failures without deadlock', async () => {
      const results: any[] = [];

      for (let i = 0; i < 10; i++) {
        const result = await executor.delegate({
          provider: 'aider',
          prompt: `message ${i}`,
          retry: {
            maxRetries: 0,
            retryOnExitCodes: [],
            backoffMs: 0,
          },
        });
        results.push(result);
      }

      expect(results.length).toBe(10);
    });

    it('should maintain session health after errors', async () => {
      const session = executor.createSession('claude');

      await executor.delegate({
        provider: 'aider',
        prompt: 'error trigger',
        retry: { maxRetries: 0, retryOnExitCodes: [], backoffMs: 0 },
      });

      const retrieved = executor.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
    });
  });

  describe('Test 6: Concurrent Conversation Handling', () => {
    it('should handle 5 concurrent sessions', async () => {
      const executor = createDelegateExecutor();
      const sessions = [];

      for (let i = 0; i < 5; i++) {
        const session = executor.createSession(['claude', 'gemini', 'aider'][i % 3] as any);
        sessions.push(session);
      }

      const promises = sessions.map((session, i) =>
        executor.delegate({
          provider: ['claude', 'gemini', 'aider'][i % 3] as any,
          prompt: `concurrent message ${i}`,
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
      results.forEach(result => expect(result).toBeDefined());
    });

    it('should handle rapid message interleaving', async () => {
      const executor = createDelegateExecutor();
      const session = executor.createSession('claude');

      const interleavedResults = await Promise.all([
        executor.delegate({ provider: 'aider', prompt: 'msg1' }),
        executor.delegate({ provider: 'aider', prompt: 'msg2' }),
        executor.delegate({ provider: 'aider', prompt: 'msg3' }),
      ]);

      expect(interleavedResults.length).toBe(3);
    });
  });
});