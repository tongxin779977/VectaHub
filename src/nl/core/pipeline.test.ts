import { describe, it, expect } from 'vitest';
import { createNLProcessor } from './pipeline.js';

const mockLLMConfig = {
  apiKey: 'test-key',
  baseUrl: 'http://localhost:11434/v1',
  model: 'qwen3:1.7b',
  temperature: 0.3,
  maxTokens: 1024,
};

describe('NLProcessor', () => {
  describe('createNLProcessor', () => {
    it('should throw if llmConfig is missing', () => {
      expect(() => createNLProcessor({ llmConfig: null as any })).toThrow();
      expect(() => createNLProcessor({} as any)).toThrow();
    });

    it('should create a processor with llmConfig', () => {
      const processor = createNLProcessor({ llmConfig: mockLLMConfig });
      expect(processor).toBeDefined();
      expect(typeof processor.parse).toBe('function');
    });
  });

  describe('empty input', () => {
    it('should throw for empty string', async () => {
      const processor = createNLProcessor({ llmConfig: mockLLMConfig });
      await expect(processor.parse({ input: '' })).rejects.toThrow('Empty input');
    });

    it('should throw for whitespace-only input', async () => {
      const processor = createNLProcessor({ llmConfig: mockLLMConfig });
      await expect(processor.parse({ input: '   \t\n  ' })).rejects.toThrow('Empty input');
    });
  });

  describe('LLM-only pipeline', () => {
    it('should throw when LLM call fails', async () => {
      const processor = createNLProcessor({ llmConfig: mockLLMConfig });
      await expect(processor.parse({ input: 'test input' })).rejects.toThrow();
    });
  });
});
