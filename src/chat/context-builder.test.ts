import { describe, it, expect } from 'vitest';
import { createContextBuilder } from './context-builder.js';

describe('createContextBuilder', () => {
  it('should return basic context with cwd when no sessionManager', async () => {
    const builder = createContextBuilder();
    const context = await builder.buildContext();

    expect(context).toHaveProperty('cwd');
    expect(typeof (context as { cwd: string }).cwd).toBe('string');
  });

  it('should return basic context with cwd when sessionManager is null', async () => {
    const builder = createContextBuilder(null);
    const context = await builder.buildContext();

    expect(context).toHaveProperty('cwd');
  });

  it('should use sessionManager to get session context when sessionId provided', async () => {
    const mockSession = {
      sessionId: 'test-session',
      history: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      userPreferences: { executionMode: 'relaxed', preferredTools: [], verbose: false, autoConfirm: false },
      projectContext: { cwd: '/mock/project', gitStatus: { branch: 'main', modified: [], staged: [] } },
      recentActions: [],
    };
    const mockSessionManager = {
      getSession: () => mockSession,
      buildContextAwarePrompt: (base: string) => base + '\n## Test Context',
    };
    const builder = createContextBuilder(mockSessionManager as never);
    const context = await builder.buildContext('test-session');

    expect(context).toHaveProperty('cwd', '/mock/project');
    expect(context).toHaveProperty('history');
    expect(context).toHaveProperty('projectContext');
  });

  it('should return basic context when sessionManager exists but session not found', async () => {
    const mockSessionManager = {
      getSession: () => undefined,
      buildContextAwarePrompt: (base: string) => base,
    };
    const builder = createContextBuilder(mockSessionManager as never);
    const context = await builder.buildContext('nonexistent');

    expect(context).toHaveProperty('cwd');
  });

  it('should include prompt enhancement when sessionManager provides it', async () => {
    const mockSessionManager = {
      getSession: () => ({
        sessionId: 's1',
        history: [],
        userPreferences: { executionMode: 'relaxed', preferredTools: [], verbose: false, autoConfirm: false },
        projectContext: { cwd: '/project' },
        recentActions: [],
      }),
      buildContextAwarePrompt: (base: string) => base + '\n## Enhanced Context',
    };
    const builder = createContextBuilder(mockSessionManager as never);
    const context = await builder.buildContext('s1');

    expect(context).toHaveProperty('enhancedPrompt');
    expect((context as { enhancedPrompt: string }).enhancedPrompt).toContain('Enhanced Context');
  });
});
