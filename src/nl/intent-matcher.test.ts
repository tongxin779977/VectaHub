import { describe, it, expect } from 'vitest';
import { createIntentMatcher, type IntentPattern } from './intent-matcher.js';

describe('IntentMatcher', () => {
  const testPatterns: IntentPattern[] = [
    {
      intent: 'TEST_INTENT',
      keywords: ['test', '测试'],
      weight: 0.9,
    },
    {
      intent: 'ANOTHER_INTENT',
      keywords: ['another', '另一个'],
      weight: 0.8,
    },
  ];

  describe('match', () => {
    it('should return confidence score', () => {
      const matcher = createIntentMatcher(testPatterns);
      const result = matcher.match('这是一个测试');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return UNKNOWN for no match', () => {
      const matcher = createIntentMatcher(testPatterns);
      const result = matcher.match('完全不匹配的内容');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    it('should prefer higher confidence match', () => {
      const matcher = createIntentMatcher(testPatterns);
      const result = matcher.match('测试 another');
      expect(['TEST_INTENT', 'ANOTHER_INTENT']).toContain(result.intent);
    });
  });

  describe('registerPattern', () => {
    it('should add new pattern', () => {
      const matcher = createIntentMatcher(testPatterns);
      matcher.registerPattern({
        intent: 'NEW_PATTERN',
        keywords: ['new'],
        weight: 0.7,
      });
      const patterns = matcher.getPatterns();
      expect(patterns).toHaveLength(3);
    });
  });

  describe('getPatterns', () => {
    it('should return all registered patterns', () => {
      const matcher = createIntentMatcher(testPatterns);
      const patterns = matcher.getPatterns();
      expect(patterns).toEqual(testPatterns);
    });
  });
});