import { expect, test } from 'vitest';
import { createSessionManager } from './session-manager.js';

test('should create and retrieve session', () => {
  const manager = createSessionManager();
  const session = manager.createSession('test-session');
  
  expect(session.sessionId).toBe('test-session');
  expect(session.history).toEqual([]);
  
  const retrieved = manager.getSession('test-session');
  expect(retrieved).toBeDefined();
  expect(retrieved?.sessionId).toBe('test-session');
});

test('should add and retrieve messages', () => {
  const manager = createSessionManager();
  manager.createSession('test-session');
  
  manager.addUserMessage('test-session', 'Hello');
  manager.addAssistantMessage('test-session', 'Hi there');
  
  const session = manager.getSession('test-session');
  expect(session?.history.length).toBe(2);
  expect(session?.history[0].content).toBe('Hello');
  expect(session?.history[1].content).toBe('Hi there');
});

test('should update user preferences', () => {
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

test('should add recent actions', () => {
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

test('should build context-aware prompt', () => {
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

test('should estimate tokens correctly', () => {
  const manager = createSessionManager();
  manager.createSession('test-session');

  const englishTokens = manager.estimateTokens('hello world');
  expect(englishTokens).toBeGreaterThan(0);
  expect(englishTokens).toBeLessThan(20);

  const chineseTokens = manager.estimateTokens('你好世界');
  expect(chineseTokens).toBe(4);
});

test('should track session token count', () => {
  const manager = createSessionManager();
  manager.createSession('test-session');

  manager.addUserMessage('test-session', 'Hello, this is a test message');
  manager.addAssistantMessage('test-session', 'Hi there, I can help with that');

  const tokenCount = manager.getSessionTokenCount('test-session');
  expect(tokenCount).toBeGreaterThan(0);
});

test('should compact history when messages exceed threshold', () => {
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

test('should summarize history', () => {
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
