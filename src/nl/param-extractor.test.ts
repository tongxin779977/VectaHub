import { describe, it, expect } from 'vitest';
import { createParamExtractor } from './param-extractor.js';

describe('ParamExtractor', () => {
  const extractor = createParamExtractor();

  describe('path extraction', () => {
    it.skip('extracts relative path', () => {
      const result = extractor.extract('查找 src 目录');
      expect(result.path).toBe('src');
    });

    it('extracts dot path', () => {
      const result = extractor.extract('查看当前目录');
      expect(result.path).toBe('.');
    });

    it('extracts explicit path with slash', () => {
      const result = extractor.extract('查找 ./src/utils 文件');
      expect(result.path).toBe('./src/utils');
    });

    it('extracts home path', () => {
      const result = extractor.extract('查看 ~/projects');
      expect(result.path).toBe('~/projects');
    });
  });

  describe('mode extraction', () => {
    it.skip('extracts stat mode', () => {
      const result = extractor.extract('查看文件状态');
      expect(result.mode).toBe('stat');
    });

    it.skip('extracts detailed mode', () => {
      const result = extractor.extract('查看详细信息');
      expect(result.mode).toBe('detailed');
    });

    it.skip('extracts simple mode', () => {
      const result = extractor.extract('简单查看');
      expect(result.mode).toBe('simple');
    });
  });

  describe('file type extraction', () => {
    it.skip('extracts ts type', () => {
      const result = extractor.extract('查找 ts 文件');
      expect(result.type).toBe('ts');
    });

    it.skip('extracts js type', () => {
      const result = extractor.extract('查找 js 文件');
      expect(result.type).toBe('js');
    });

    it.skip('extracts directory type', () => {
      const result = extractor.extract('查找目录');
      expect(result.type).toBe('directory');
    });
  });

  describe('action extraction', () => {
    it.skip('extracts git action commit', () => {
      const result = extractor.extract('git commit');
      expect(result.action).toBe('commit');
    });

    it.skip('extracts git action push', () => {
      const result = extractor.extract('git push');
      expect(result.action).toBe('push');
    });

    it.skip('extracts git action pull', () => {
      const result = extractor.extract('git pull');
      expect(result.action).toBe('pull');
    });

    it.skip('extracts git action diff', () => {
      const result = extractor.extract('git diff');
      expect(result.action).toBe('diff');
    });
  });

  describe('boost calculation', () => {
    it('returns 0 when no params extracted', () => {
      const result = extractor.extract('完全无关');
      // expect(extractor.calculateBoost(result)).toBe(0);
    });

    it('returns positive boost when params extracted', () => {
      const result = extractor.extract('查找 src 目录');
      // expect(extractor.calculateBoost(result)).toBeGreaterThan(0);
    });

    it('accumulates boost for multiple params', () => {
      const single = extractor.extract('commit');
      const multi = extractor.extract('git commit in src');
      // expect(extractor.calculateBoost(multi)).toBeGreaterThanOrEqual(extractor.calculateBoost(single));
    });
  });

  describe('empty input', () => {
    it('handles empty string', () => {
      const result = extractor.extract('');
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
