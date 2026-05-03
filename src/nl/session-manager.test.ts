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
