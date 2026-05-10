import { describe, it, expect } from 'vitest';
import { adaptTemplateToPattern, adaptAllTemplates } from './adapter.js';
import type { IntentTemplate } from '../templates/index.js';

describe('Adapter', () => {
  const mockTemplate: IntentTemplate = {
    intent: 'FILE_FIND',
    category: 'QUERY',
    patterns: [/find|search|查找/],
    examples: ['查找文件', 'find files'],
    priority: 0.85,
    weight: 0.85,
  };

  describe('adaptTemplateToPattern', () => {
    it('maps intent correctly', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.intent).toBe('FILE_FIND');
    });

    it('preserves weight from template', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.weight).toBe(0.85);
    });

    it('returns empty keywords for LLM-only mode', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.keywords).toEqual([]);
    });

    it('returns empty negativeKeywords', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.negativeKeywords).toEqual([]);
    });
  });

  describe('adaptAllTemplates', () => {
    it('converts all templates to patterns', () => {
      const result = adaptAllTemplates();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].intent).toBeDefined();
    });
  });
});
