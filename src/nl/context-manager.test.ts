import { describe, it, expect, beforeEach } from 'vitest';
import {
  contextManager,
  createContextAwareParser,
  type ConversationContext
} from './context-manager.js';
import type { IntentName } from '../types/index.js';

describe('ContextManager', () => {
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    contextManager.deleteSession(testSessionId);
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const context = contextManager.createSession(testSessionId);
      expect(context).toBeDefined();
      expect(context.sessionId).toBe(testSessionId);
      expect(context.history).toEqual([]);
    });
  });

  describe('getSession', () => {
    it('should return existing session', () => {
      contextManager.createSession(testSessionId);
      const context = contextManager.getSession(testSessionId);
      expect(context).toBeDefined();
      expect(context?.sessionId).toBe(testSessionId);
    });

    it('should return undefined for non-existent session', () => {
      const context = contextManager.getSession('non-existent');
      expect(context).toBeUndefined();
    });
  });

  describe('addTurn', () => {
    it('should add a turn to session history', () => {
      contextManager.createSession(testSessionId);
      contextManager.addTurn(testSessionId, {
        role: 'user',
        content: '压缩图片',
        intent: 'IMAGE_COMPRESS',
      });

      const context = contextManager.getSession(testSessionId);
      expect(context?.history.length).toBe(1);
      expect(context?.history[0].content).toBe('压缩图片');
    });
  });

  describe('resolveReference', () => {
    it('should resolve file path from recent context', () => {
      const sessionId = 'ref-test';
      contextManager.createSession(sessionId);
      contextManager.addTurn(sessionId, {
        role: 'user',
        content: '处理 src/nl/parser.ts 文件',
      });

      const context = contextManager.getSession(sessionId);
      expect(context).toBeDefined();
      expect(context?.referencedEntities.length).toBeGreaterThan(0);
    });
  });

  describe('applyContext', () => {
    it('should return context for session', () => {
      contextManager.createSession(testSessionId);
      contextManager.addTurn(testSessionId, {
        role: 'user',
        content: '处理 src/nl/parser.ts',
      });

      const { enrichedInput, context } = contextManager.applyContext(
        testSessionId,
        '压缩这个文件'
      );

      expect(enrichedInput).toBeDefined();
      expect(context).toBeDefined();
    });
  });
});

describe('ContextAwareParser', () => {
  const baseParser = {
    parse: (input: string) => ({
      intent: 'IMAGE_COMPRESS' as IntentName,
      confidence: 0.9,
      params: {} as Record<string, unknown>,
    }),
  };

  const contextParser = createContextAwareParser(baseParser);

  it('should pass through normal input', () => {
    const result = contextParser.parse('压缩图片', 'session-1');
    expect(result.intent).toBe('IMAGE_COMPRESS');
  });
});
