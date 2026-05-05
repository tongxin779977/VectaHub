import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAIModuleRegistry } from '../registry.js';
import { createSemanticMatchingModule } from './semantic-matcher.js';
import type { AIModuleContext } from '../types.js';
import type { SemanticMatchInput } from './types.js';

const mockContext: AIModuleContext = { userInput: 'test' };

function createMockLLMClient(embedFn?: (text: string) => Promise<number[]>, provider = 'openai') {
  return {
    embed: embedFn ?? vi.fn().mockResolvedValue([1, 0, 0]),
    provider,
  };
}

describe('SemanticMatchingModule', () => {
  describe('module registration in registry', () => {
    it('should register and retrieve from registry', () => {
      const registry = createAIModuleRegistry();
      const module = createSemanticMatchingModule(createMockLLMClient());
      registry.register(module);
      expect(registry.get('vectahub.semantic-matching')).toBe(module);
    });

    it('should have correct module metadata', () => {
      const module = createSemanticMatchingModule(createMockLLMClient());
      expect(module.id).toBe('vectahub.semantic-matching');
      expect(module.name).toBe('Semantic Matching');
      expect(module.version).toBe('1.0.0');
      expect(module.type).toBe('ai-enhancement');
    });

    it('should not be in registry after unregister', () => {
      const registry = createAIModuleRegistry();
      const module = createSemanticMatchingModule(createMockLLMClient());
      registry.register(module);
      registry.unregister('vectahub.semantic-matching');
      expect(registry.get('vectahub.semantic-matching')).toBeUndefined();
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe('canHandle', () => {
    it('should return false when no LLM client', async () => {
      const module = createSemanticMatchingModule();
      expect(await module.canHandle(mockContext)).toBe(false);
    });

    it('should return false for Anthropic provider', async () => {
      const module = createSemanticMatchingModule(createMockLLMClient(undefined, 'anthropic'));
      expect(await module.canHandle(mockContext)).toBe(false);
    });

    it('should return true for OpenAI provider', async () => {
      const module = createSemanticMatchingModule(createMockLLMClient(undefined, 'openai'));
      expect(await module.canHandle(mockContext)).toBe(true);
    });

    it('should return true for Ollama provider', async () => {
      const module = createSemanticMatchingModule(createMockLLMClient(undefined, 'ollama'));
      expect(await module.canHandle(mockContext)).toBe(true);
    });

    it('should return true for Groq provider', async () => {
      const module = createSemanticMatchingModule(createMockLLMClient(undefined, 'groq'));
      expect(await module.canHandle(mockContext)).toBe(true);
    });
  });

  describe('execute - pure keyword matching (no LLM)', () => {
    it('should return similarityScore 0 when no LLM client', async () => {
      const module = createSemanticMatchingModule();
      const input: SemanticMatchInput = {
        userInput: 'search for files',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find', 'file'] },
          { name: 'RUN_SCRIPT', description: 'run scripts', keywords: ['run', 'script', 'build'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.similarityScore).toBe(0);
    });

    it('should compute keywordScore based on word overlap', async () => {
      const module = createSemanticMatchingModule();
      const input: SemanticMatchInput = {
        userInput: 'search for files',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.intentName).toBe('FILE_FIND');
      expect(result.data?.keywordScore).toBeGreaterThan(0);
    });

    it('should set combinedScore = alpha * keywordScore when no LLM', async () => {
      const module = createSemanticMatchingModule(undefined, { alpha: 0.7 });
      const input: SemanticMatchInput = {
        userInput: 'search for files',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      const { keywordScore, combinedScore } = result.data!;
      expect(combinedScore).toBeCloseTo(0.7 * keywordScore, 5);
    });

    it('should select template with highest keywordScore when no LLM', async () => {
      const module = createSemanticMatchingModule();
      const input: SemanticMatchInput = {
        userInput: 'install npm package',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
          { name: 'INSTALL_PACKAGE', description: 'install packages', keywords: ['install', 'package', 'npm'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.intentName).toBe('INSTALL_PACKAGE');
    });
  });

  describe('execute - semantic matching with mock embedding', () => {
    it('should compute cosine similarity from embeddings', async () => {
      const userEmbedding = [1, 0, 0];
      const templateEmbedding = [0.7071, 0.7071, 0];
      const embedFn = vi.fn().mockImplementation((text: string) => {
        if (text === 'find files search find') return templateEmbedding;
        return userEmbedding;
      });
      const module = createSemanticMatchingModule(createMockLLMClient(embedFn, 'openai'));
      const input: SemanticMatchInput = {
        userInput: 'search for files',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.similarityScore).toBeGreaterThan(0);
      expect(result.data?.similarityScore).toBeLessThanOrEqual(1);
    });

    it('should return correct intent from semantic match', async () => {
      const userEmbedding = [1, 0, 0];
      const gitEmbedding = [0, 1, 0];
      const fileEmbedding = [0.9, 0.1, 0];
      const embedFn = vi.fn().mockImplementation((text: string) => {
        if (text.includes('commit')) return gitEmbedding;
        if (text.includes('find')) return fileEmbedding;
        return userEmbedding;
      });
      const module = createSemanticMatchingModule(createMockLLMClient(embedFn, 'openai'));
      const input: SemanticMatchInput = {
        userInput: 'search for files',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
          { name: 'GIT_WORKFLOW', description: 'commit changes', keywords: ['commit', 'push'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.intentName).toBe('FILE_FIND');
    });
  });

  describe('alpha weighting', () => {
    it('should compute combinedScore = alpha * keywordScore + (1-alpha) * similarityScore', async () => {
      const userEmbedding = [1, 0, 0];
      const templateEmbedding = [1, 0, 0];
      const embedFn = vi.fn().mockImplementation(() => userEmbedding);
      const module = createSemanticMatchingModule(
        createMockLLMClient(embedFn, 'openai'),
        { alpha: 0.4 }
      );
      const input: SemanticMatchInput = {
        userInput: 'search find',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      const { keywordScore, similarityScore, combinedScore } = result.data!;
      const expected = 0.4 * keywordScore + 0.6 * similarityScore;
      expect(combinedScore).toBeCloseTo(expected, 5);
    });

    it('should weight similarity more when alpha is low', async () => {
      const userEmbedding = [1, 0, 0];
      const templateEmbedding = [1, 0, 0];
      const embedFn = vi.fn().mockImplementation(() => userEmbedding);
      const moduleLowAlpha = createSemanticMatchingModule(
        createMockLLMClient(embedFn, 'openai'),
        { alpha: 0.1 }
      );
      const input: SemanticMatchInput = {
        userInput: 'search find',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
        ],
      };
      const result = await moduleLowAlpha.execute(input, mockContext);
      expect(result.success).toBe(true);
      const { similarityScore, combinedScore } = result.data!;
      expect(combinedScore).toBeCloseTo(0.1 * result.data!.keywordScore + 0.9 * similarityScore, 5);
    });
  });

  describe('cosineSimilarity helper', () => {
    it('should return 1 for identical vectors', async () => {
      const embedFn = vi.fn().mockResolvedValue([1, 0, 0]);
      const module = createSemanticMatchingModule(createMockLLMClient(embedFn, 'openai'));
      const input: SemanticMatchInput = {
        userInput: 'test',
        templateDescriptions: [
          { name: 'TEST', description: 'test', keywords: ['test'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data!.similarityScore).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', async () => {
      const userVec = [1, 0, 0];
      let callCount = 0;
      const embedFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return userVec;
        return [0, 1, 0];
      });
      const module = createSemanticMatchingModule(createMockLLMClient(embedFn, 'openai'));
      const input: SemanticMatchInput = {
        userInput: 'search files',
        templateDescriptions: [
          { name: 'GIT', description: 'commit push', keywords: ['commit', 'push'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data!.similarityScore).toBeCloseTo(0, 5);
    });
  });

  describe('registry pipeline unaffected when module unregistered', () => {
    it('should not appear in applicable modules after unregister', async () => {
      const registry = createAIModuleRegistry();
      const module = createSemanticMatchingModule(createMockLLMClient(undefined, 'openai'));
      registry.register(module);
      registry.unregister('vectahub.semantic-matching');
      const applicable = await registry.findApplicable(mockContext);
      expect(applicable.find(m => m.id === 'vectahub.semantic-matching')).toBeUndefined();
    });

    it('should not affect other modules in registry', async () => {
      const registry = createAIModuleRegistry();
      const otherModule = {
        id: 'other-module',
        name: 'Other',
        version: '1.0.0',
        type: 'ai-enhancement' as const,
        canHandle: async () => true,
        execute: async () => ({ success: true, confidence: 1 }),
      };
      const smModule = createSemanticMatchingModule(createMockLLMClient(undefined, 'openai'));
      registry.register(smModule);
      registry.register(otherModule);
      registry.unregister('vectahub.semantic-matching');
      const applicable = await registry.findApplicable(mockContext);
      expect(applicable).toHaveLength(1);
      expect(applicable[0].id).toBe('other-module');
    });
  });

  describe('initialize', () => {
    it('should not throw even without LLM client', async () => {
      const module = createSemanticMatchingModule();
      await expect(module.initialize!()).resolves.toBeUndefined();
    });

    it('should not throw with LLM client', async () => {
      const module = createSemanticMatchingModule(createMockLLMClient(undefined, 'openai'));
      await expect(module.initialize!()).resolves.toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty template descriptions', async () => {
      const module = createSemanticMatchingModule();
      const input: SemanticMatchInput = {
        userInput: 'test',
        templateDescriptions: [],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle template with no matching keywords', async () => {
      const module = createSemanticMatchingModule();
      const input: SemanticMatchInput = {
        userInput: 'something completely unrelated',
        templateDescriptions: [
          { name: 'FILE_FIND', description: 'find files', keywords: ['search', 'find'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.keywordScore).toBe(0);
      expect(result.data?.combinedScore).toBe(0);
    });

    it('should handle embed errors gracefully', async () => {
      const embedFn = vi.fn().mockRejectedValue(new Error('API error'));
      const module = createSemanticMatchingModule(createMockLLMClient(embedFn, 'openai'));
      const input: SemanticMatchInput = {
        userInput: 'test',
        templateDescriptions: [
          { name: 'TEST', description: 'test', keywords: ['test'] },
        ],
      };
      const result = await module.execute(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.similarityScore).toBe(0);
    });
  });
});
