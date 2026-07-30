import { describe, it, expect } from 'vitest';
import { createSessionManager } from './session-manager.js';

describe('SessionManager', () => {
  describe('basic session operations', () => {
    it('should create and retrieve session', () => {
      const manager = createSessionManager();
      const session = manager.createSession('test-session');

      expect(session.sessionId).toBe('test-session');
      expect(session.history).toEqual([]);

      const retrieved = manager.getSession('test-session');
      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe('test-session');
    });

    it('should add and retrieve messages', () => {
      const manager = createSessionManager();
      manager.createSession('test-session');

      manager.addUserMessage('test-session', 'Hello');
      manager.addAssistantMessage('test-session', 'Hi there');

      const session = manager.getSession('test-session');
      expect(session?.history.length).toBe(2);
      expect(session?.history[0].content).toBe('Hello');
      expect(session?.history[1].content).toBe('Hi there');
    });

    it('should update user preferences', () => {
      const manager = createSessionManager();
      manager.createSession('test-session');

      manager.updateUserPreferences('test-session', {
        executionMode: 'strict',
        verbose: true,
      });

      const session = manager.getSession('test-session');
      expect(session?.userPreferences.executionMode).toBe('strict');
      expect(session?.userPreferences.verbose).toBe(true);
    });

    it('should add recent actions', () => {
      const manager = createSessionManager();
      manager.createSession('test-session');

      manager.addRecentAction('test-session', {
        type: 'workflow',
        description: 'Created workflow "test"',
      });

      const session = manager.getSession('test-session');
      expect(session?.recentActions.length).toBe(1);
      expect(session?.recentActions[0].description).toBe('Created workflow "test"');
    });
  });

  describe('buildContextAwarePrompt', () => {
    it('should build context-aware prompt', () => {
      const manager = createSessionManager();
      manager.createSession('test-session');
      manager.updateUserPreferences('test-session', {
        executionMode: 'relaxed',
        verbose: true,
      });
      manager.addRecentAction('test-session', {
        type: 'test',
        description: 'Test action',
      });

      const basePrompt = 'Base system prompt';
      const enhanced = manager.buildContextAwarePrompt(basePrompt, 'test-session');

      expect(enhanced).toContain('Base system prompt');
      expect(enhanced).toContain('当前项目上下文');
      expect(enhanced).toContain('用户偏好');
      expect(enhanced).toContain('最近操作');
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens correctly', () => {
      const manager = createSessionManager();

      const englishTokens = manager.estimateTokens('hello world');
      expect(englishTokens).toBeGreaterThan(0);
      expect(englishTokens).toBeLessThan(20);

      const chineseTokens = manager.estimateTokens('你好世界');
      expect(chineseTokens).toBe(4);
    });

    it('should track session token count', () => {
      const manager = createSessionManager();
      manager.createSession('test-session');

      manager.addUserMessage('test-session', 'Hello, this is a test message');
      manager.addAssistantMessage('test-session', 'Hi there, I can help with that');

      const tokenCount = manager.getSessionTokenCount('test-session');
      expect(tokenCount).toBeGreaterThan(0);
    });
  });

  describe('history compaction', () => {
    it('should compact history when messages exceed threshold', () => {
      const manager = createSessionManager();
      manager.createSession('test-session');

      for (let i = 0; i < 35; i++) {
        manager.addUserMessage('test-session', `Message ${i}`);
        manager.addAssistantMessage('test-session', `Response ${i}`);
      }

      const session = manager.getSession('test-session');
      expect(session?.history.length).toBeLessThan(70);
      expect(session?.history[0].content).toContain('对话摘要');
    });

    it('should summarize history', () => {
      const manager = createSessionManager();

      const messages = [
        { role: 'user' as const, content: 'Fix the CI pipeline' },
        { role: 'assistant' as const, content: 'I will fix the CI pipeline for you' },
        { role: 'user' as const, content: 'Run tests' },
        { role: 'assistant' as const, content: 'Running tests now' },
      ];

      const summary = manager.summarizeHistory(messages);
      expect(summary).toContain('4 条消息');
      expect(summary).toContain('Fix the CI pipeline');
    });
  });

  describe('L1/L2/L3 layered memory', () => {
    it('should assemble context in L3 → L2 → L1 order', () => {
      const manager = createSessionManager();
      manager.createSession('s1');

      manager.addUserMessage('s1', 'Hello');
      manager.addAssistantMessage('s1', 'Hi');

      const ctx = manager.getFormattedContext('s1');
      const l3Pos = ctx.indexOf('[L3 项目上下文]');
      const l1Pos = ctx.indexOf('[L1 工作记忆]');

      expect(l3Pos).toBeGreaterThanOrEqual(0);
      expect(l3Pos).toBeLessThan(l1Pos);
      expect(l1Pos).toBeGreaterThanOrEqual(0);
    });

    it('should show empty context for nonexistent session', () => {
      const manager = createSessionManager();
      expect(manager.getFormattedContext('nonexistent')).toBe('');
    });

    it('should include L1 working memory content', () => {
      const manager = createSessionManager();
      manager.createSession('s1');

      manager.addUserMessage('s1', 'What is vectahub?');
      manager.addAssistantMessage('s1', 'Vectahub is a CI/CD orchestrator');

      const ctx = manager.getFormattedContext('s1');
      expect(ctx).toContain('[L1 工作记忆]');
      expect(ctx).toContain('[user]: What is vectahub?');
      expect(ctx).toContain('[assistant]: Vectahub is a CI/CD orchestrator');
    });

    it('should include L3 project context content', () => {
      const manager = createSessionManager();
      manager.createSession('s1');

      const ctx = manager.getFormattedContext('s1');
      expect(ctx).toContain('[L3 项目上下文]');
      expect(ctx).toContain('工作目录:');
    });

    it('should populate L2 summary after compaction', () => {
      const manager = createSessionManager({ l1WindowRounds: 3 });
      manager.createSession('s1');

      for (let i = 0; i < 30; i++) {
        manager.addUserMessage('s1', `Message ${i}`);
        manager.addAssistantMessage('s1', `Response ${i}`);
      }

      const breakdown = manager.getTokenBreakdown('s1');
      expect(breakdown.l2).toBeGreaterThan(0);

      const ctx = manager.getFormattedContext('s1');
      expect(ctx).toContain('[L2 会话摘要]');
    });

    it('should trim L1 working memory to window size after compaction', () => {
      const manager = createSessionManager({ l1WindowRounds: 3 });
      manager.createSession('s1');

      for (let i = 0; i < 20; i++) {
        manager.addUserMessage('s1', `Msg ${i}`);
      }

      const breakdown = manager.getTokenBreakdown('s1');
      expect(breakdown.l1).toBeGreaterThan(0);
      expect(breakdown.l1).toBeLessThan(5000);
    });

    it('should report token breakdown for empty session', () => {
      const manager = createSessionManager();
      manager.createSession('s1');

      const breakdown = manager.getTokenBreakdown('s1');
      expect(breakdown.l1).toBeGreaterThanOrEqual(0);
      expect(breakdown.l2).toBe(0);
      expect(breakdown.l3).toBeGreaterThanOrEqual(0);
      expect(breakdown.total).toBe(breakdown.l1 + breakdown.l2 + breakdown.l3);
    });

    it('should report zero breakdown for nonexistent session', () => {
      const manager = createSessionManager();
      const breakdown = manager.getTokenBreakdown('no-such');
      expect(breakdown).toEqual({ l1: 0, l2: 0, l3: 0, total: 0 });
    });

    it('should update L3 when project context is updated', () => {
      const manager = createSessionManager();
      manager.createSession('s1');

      manager.updateProjectContext('s1', {
        cwd: '/custom/path',
        gitStatus: { branch: 'feature-x', modified: ['a.ts'], staged: ['b.ts'] },
      });

      const ctx = manager.getFormattedContext('s1');
      expect(ctx).toContain('/custom/path');
      expect(ctx).toContain('feature-x');
    });

    it('should update L3 packageJson name in context', () => {
      const manager = createSessionManager();
      manager.createSession('s1');

      manager.updateProjectContext('s1', {
        packageJson: { name: 'my-project' },
      });

      const ctx = manager.getFormattedContext('s1');
      expect(ctx).toContain('my-project');
    });
  });

  describe('l1WindowRounds option', () => {
    it('should respect custom window rounds', () => {
      const manager = createSessionManager({ l1WindowRounds: 2 });
      manager.createSession('s1');

      for (let i = 0; i < 15; i++) {
        manager.addUserMessage('s1', `Msg ${i}`);
        manager.addAssistantMessage('s1', `Resp ${i}`);
      }

      const ctx = manager.getFormattedContext('s1');
      expect(ctx).toContain('[L1 工作记忆]');
    });
  });

  describe('cleanup on delete', () => {
    it('should clean up layers on deleteSession', () => {
      const manager = createSessionManager();
      manager.createSession('s1');
      manager.addUserMessage('s1', 'test');

      manager.deleteSession('s1');
      expect(manager.getSession('s1')).toBeUndefined();
      expect(manager.getFormattedContext('s1')).toBe('');
    });

    it('should clean up layers on shutdown', () => {
      const manager = createSessionManager();
      manager.createSession('s1');
      manager.addUserMessage('s1', 'test');

      manager.shutdown();
      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getFormattedContext('s1')).toBe('');
    });
  });
});
