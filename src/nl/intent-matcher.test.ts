import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIntentMatcher, type IntentPattern } from './intent-matcher.js';
import { audit } from '../utils/audit.js';

vi.mock('../utils/audit.js', () => ({
  audit: {
    intentMatch: vi.fn(),
  },
}));

describe('Intent Matcher', () => {
  const patterns: IntentPattern[] = [
    { intent: 'FILE_FIND', keywords: ['查找文件', '找文件', '搜索文件', 'find', 'search'], weight: 0.2 },
    { intent: 'GIT_WORKFLOW', keywords: ['提交代码', '创建分支', '推送', 'commit', 'branch', 'push'], weight: 0.25 },
    { intent: 'FETCH_HOT_NEWS', keywords: ['热榜', 'trending', '排行榜', '热门'], weight: 0.3 },
    { intent: 'SYSTEM_INFO', keywords: ['系统信息', 'system', 'info', '查看系统'], weight: 0.15 },
    { intent: 'OPENCLI_TOOL', keywords: ['opencli', '工具', 'tool'], weight: 0.1 },
  ];

  let matcher: ReturnType<typeof createIntentMatcher>;

  beforeEach(() => {
    matcher = createIntentMatcher(patterns);
  });

  describe('match', () => {
    it('matches FILE_FIND intent with Chinese keywords', () => {
      const result = matcher.match('查找文件 *.ts');
      expect(result.intent).toBe('FILE_FIND');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('matches FILE_FIND intent with English keywords', () => {
      const result = matcher.match('find *.ts files');
      expect(result.intent).toBe('FILE_FIND');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('matches GIT_WORKFLOW with commit keywords', () => {
      const result = matcher.match('提交代码到仓库');
      expect(result.intent).toBe('GIT_WORKFLOW');
    });

    it('matches GIT_WORKFLOW with push keywords', () => {
      const result = matcher.match('push to remote');
      expect(result.intent).toBe('GIT_WORKFLOW');
    });

    it('matches FETCH_HOT_NEWS with trending keywords', () => {
      const result = matcher.match('查看热榜');
      expect(result.intent).toBe('FETCH_HOT_NEWS');
    });

    it('matches SYSTEM_INFO with system keywords', () => {
      const result = matcher.match('查看系统信息');
      expect(result.intent).toBe('SYSTEM_INFO');
    });

    it('returns UNKNOWN when no match found', () => {
      const result = matcher.match('这是一个完全未知的请求 xyz123');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    it('returns highest confidence when multiple matches', () => {
      const result = matcher.match('查找文件并提交代码');
      expect(result.intent).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('calculates confidence based on keyword matches', () => {
      const singleMatch = matcher.match('查找');
      const doubleMatch = matcher.match('查找文件');

      expect(doubleMatch.confidence).toBeGreaterThanOrEqual(singleMatch.confidence);
    });

    it('is case insensitive', () => {
      const lower = matcher.match('FIND files');
      const upper = matcher.match('FIND FILES');
      const mixed = matcher.match('FiNd FiLeS');

      expect(lower.intent).toBe(upper.intent);
      expect(upper.intent).toBe(mixed.intent);
    });

    it('handles empty input', () => {
      const result = matcher.match('');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    it('handles whitespace-only input', () => {
      const result = matcher.match('   \n\t  ');
      expect(result.intent).toBe('UNKNOWN');
    });

    it('records audit log when sessionId provided', () => {
      matcher.match('查找文件', 'session-123');
      expect(audit.intentMatch).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Object),
        'session-123',
        expect.any(Object)
      );
    });
  });

  describe('registerPattern', () => {
    it('registers new pattern', () => {
      const newPattern: IntentPattern = {
        intent: 'CUSTOM_INTENT',
        keywords: ['custom', 'test'],
        weight: 0.5,
      };

      matcher.registerPattern(newPattern);
      const result = matcher.match('custom test keyword');
      expect(result.intent).toBe('CUSTOM_INTENT');
    });

    it('added pattern increases match count', () => {
      const before = matcher.match('unique-keyword-xyz');
      expect(before.intent).toBe('UNKNOWN');

      matcher.registerPattern({
        intent: 'NEW_INTENT',
        keywords: ['unique-keyword-xyz'],
        weight: 0.5,
      });

      const after = matcher.match('unique-keyword-xyz');
      expect(after.intent).toBe('NEW_INTENT');
    });
  });

  describe('getPatterns', () => {
    it('returns copy of patterns', () => {
      const patterns1 = matcher.getPatterns();
      const patterns2 = matcher.getPatterns();

      expect(patterns1).toEqual(patterns2);
      expect(patterns1).not.toBe(patterns2);
    });

    it('returns all registered patterns', () => {
      const patterns = matcher.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('confidence calculation', () => {
    it('higher weight produces higher confidence', () => {
      const highWeightPattern: IntentPattern = {
        intent: 'HIGH_WEIGHT',
        keywords: ['highweight'],
        weight: 0.8,
      };

      const lowWeightPattern: IntentPattern = {
        intent: 'LOW_WEIGHT',
        keywords: ['lowweight'],
        weight: 0.1,
      };

      const matcherHigh = createIntentMatcher([highWeightPattern]);
      const matcherLow = createIntentMatcher([lowWeightPattern]);

      const resultHigh = matcherHigh.match('highweight');
      const resultLow = matcherLow.match('lowweight');

      expect(resultHigh.confidence).toBeGreaterThan(resultLow.confidence);
    });

    it('multiple keyword matches increase confidence', () => {
      const pattern: IntentPattern = {
        intent: 'MULTI',
        keywords: ['keyword1', 'keyword2', 'keyword3'],
        weight: 0.2,
      };

      const matcherMulti = createIntentMatcher([pattern]);

      const oneMatch = matcherMulti.match('keyword1 only');
      const twoMatches = matcherMulti.match('keyword1 and keyword2');
      const threeMatches = matcherMulti.match('keyword1 keyword2 keyword3');

      expect(threeMatches.confidence).toBeGreaterThan(twoMatches.confidence);
      expect(twoMatches.confidence).toBeGreaterThan(oneMatch.confidence);
    });
  });
});
