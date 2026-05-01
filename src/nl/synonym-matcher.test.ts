import { describe, it, expect, beforeEach } from 'vitest';
import { fuzzyMatcher, createSynonymAwareMatcher } from './synonym-matcher.js';

describe('FuzzyMatcher', () => {
  describe('findCanonical', () => {
    it('should find canonical form for Chinese synonym', () => {
      expect(fuzzyMatcher.findCanonical('压缩')).toBe('compress');
      expect(fuzzyMatcher.findCanonical('删除')).toBe('delete');
    });

    it('should find canonical form for English synonym', () => {
      expect(fuzzyMatcher.findCanonical('compr')).toBeUndefined();
    });

    it('should return undefined for unknown word', () => {
      expect(fuzzyMatcher.findCanonical('xyz123')).toBeUndefined();
    });
  });

  describe('getSimilar', () => {
    it('should find similar words with threshold 0.6', () => {
      const similar = fuzzyMatcher.getSimilar('compress', 0.6);
      expect(similar.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
      const similar = fuzzyMatcher.getSimilar('xyz123456', 0.8);
      expect(similar.length).toBe(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(fuzzyMatcher.calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return high similarity for similar strings', () => {
      const sim = fuzzyMatcher.calculateSimilarity('compress', 'compres');
      expect(sim).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different strings', () => {
      const sim = fuzzyMatcher.calculateSimilarity('abc', 'xyz');
      expect(sim).toBeLessThan(0.3);
    });
  });
});

describe('SynonymAwareMatcher', () => {
  const matcher = createSynonymAwareMatcher();

  it('should match exact keyword', () => {
    const result = matcher.match('压缩', ['compress', 'delete']);
    expect(result.matched).toBe('compress');
    expect(result.similarity).toBe(1);
  });

  it('should match synonym', () => {
    const result = matcher.match('缩小', ['compress', 'resize']);
    expect(result.matched).toBe('compress');
    expect(result.similarity).toBeGreaterThan(0.5);
  });

  it('should return undefined for no match', () => {
    const result = matcher.match('xyz123', ['compress', 'delete']);
    expect(result.matched).toBeUndefined();
    expect(result.similarity).toBe(0);
  });
});
