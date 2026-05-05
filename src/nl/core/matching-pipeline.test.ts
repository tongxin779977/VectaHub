import { describe, it, expect } from 'vitest';
import { createMatchingPipeline } from './matching-pipeline.js';
import type { IntentPattern } from '../types.js';

const FILE_FIND_PATTERN: IntentPattern = {
  intent: 'FILE_FIND',
  keywords: [
    { text: '查找', tier: 'core' },
    { text: '搜索', tier: 'core' },
    { text: '文件', tier: 'generic' },
  ],
  phrases: [
    { pattern: '查找.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
  ],
  negativeKeywords: [
    { text: '创建', strength: 'soft' },
  ],
  weight: 0.85,
  priority: 5,
  tags: ['file-operation'],
};

const CREATE_FILE_PATTERN: IntentPattern = {
  intent: 'CREATE_FILE',
  keywords: [
    { text: '创建', tier: 'core' },
    { text: '新建', tier: 'core' },
    { text: '文件', tier: 'generic' },
  ],
  phrases: [
    { pattern: '创建.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
  ],
  negativeKeywords: [
    { text: '查找', strength: 'soft' },
  ],
  weight: 0.95,
  priority: 3,
};

const FILE_ARCHIVE_PATTERN: IntentPattern = {
  intent: 'FILE_ARCHIVE',
  keywords: [
    { text: '压缩', tier: 'core' },
    { text: '打包', tier: 'core' },
    { text: '目录', tier: 'generic' },
  ],
  phrases: [
    { pattern: '打包目录', isRegex: false, weight: 1.0, bonus: 2.0 },
  ],
  weight: 0.95,
  priority: 4,
};

const FILE_PERMISSION_PATTERN: IntentPattern = {
  intent: 'FILE_PERMISSION',
  keywords: [
    { text: '权限', tier: 'core' },
    { text: 'chmod', tier: 'core' },
  ],
  phrases: [
    { pattern: '文件权限', isRegex: false, weight: 1.0, bonus: 2.0 },
    { pattern: '修改权限', isRegex: false, weight: 1.0, bonus: 1.5 },
  ],
  weight: 0.95,
  priority: 5,
};

describe('MatchingPipeline', () => {
  const pipeline = createMatchingPipeline();

  describe('phrase matching (Layer 1)', () => {
    it('matches composite phrase with regex', () => {
      const result = pipeline.match('查找ts文件', [FILE_FIND_PATTERN]);
      expect(result.intent).toBe('FILE_FIND');
      expect(result.matchPath).toBe('phrase');
      expect(result.matchedPhrases).toContain('查找.*文件');
    });

    it('matches exact phrase', () => {
      const result = pipeline.match('打包目录', [FILE_ARCHIVE_PATTERN]);
      expect(result.intent).toBe('FILE_ARCHIVE');
      expect(result.matchPath).toBe('phrase');
      expect(result.confidence).toBeGreaterThan(1.0);
    });

    it('returns empty when no phrase matches', () => {
      const result = pipeline.match('运行脚本', [FILE_FIND_PATTERN]);
      expect(result.intent).toBe('UNKNOWN');
    });
  });

  describe('negative keyword filtering (Layer 2)', () => {
    it('soft negative reduces confidence', () => {
      const withNegative = pipeline.match('创建文件', [FILE_FIND_PATTERN]);
      const withoutNegative = pipeline.match('查找文件', [FILE_FIND_PATTERN]);
      expect(withNegative.confidence).toBeLessThan(withoutNegative.confidence);
    });

    it('hard negative excludes intent entirely', () => {
      const hardNegativePattern: IntentPattern = {
        intent: 'TEST_INTENT',
        keywords: [{ text: '测试', tier: 'core' }],
        negativeKeywords: [
          { text: '禁止', strength: 'hard' },
        ],
        weight: 0.9,
      };
      const result = pipeline.match('禁止测试', [hardNegativePattern]);
      expect(result.intent).toBe('UNKNOWN');
    });
  });

  describe('tiered keyword matching (Layer 3)', () => {
    it('core keywords contribute more weight', () => {
      const coreOnly: IntentPattern = {
        intent: 'CORE_ONLY',
        keywords: [{ text: '核心词', tier: 'core' }],
        weight: 0.5,
      };
      const genericOnly: IntentPattern = {
        intent: 'GENERIC_ONLY',
        keywords: [{ text: '通用词', tier: 'generic' }],
        weight: 0.5,
      };
      const coreResult = pipeline.match('核心词', [coreOnly]);
      const genericResult = pipeline.match('通用词', [genericOnly]);
      expect(coreResult.confidence).toBeGreaterThan(genericResult.confidence);
    });

    it('multiple keyword matches increase confidence', () => {
      const result = pipeline.match('查找文件', [FILE_FIND_PATTERN]);
      expect(result.matchedKeywords?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('full pipeline integration', () => {
    it('resolves FILE_FIND vs CREATE_FILE for "查找文件"', () => {
      const patterns = [FILE_FIND_PATTERN, CREATE_FILE_PATTERN];
      const result = pipeline.match('查找文件', patterns);
      expect(result.intent).toBe('FILE_FIND');
    });

    it('resolves FILE_ARCHIVE vs CREATE_FILE for "打包目录"', () => {
      const patterns = [FILE_ARCHIVE_PATTERN, CREATE_FILE_PATTERN];
      const result = pipeline.match('打包目录', patterns);
      expect(result.intent).toBe('FILE_ARCHIVE');
    });

    it('resolves FILE_PERMISSION vs CREATE_FILE for "修改权限"', () => {
      const patterns = [FILE_PERMISSION_PATTERN, CREATE_FILE_PATTERN];
      const result = pipeline.match('修改权限', patterns);
      expect(result.intent).toBe('FILE_PERMISSION');
    });

    it('returns UNKNOWN for no match', () => {
      const result = pipeline.match('完全无关的内容', [FILE_FIND_PATTERN]);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    it('handles empty input', () => {
      const result = pipeline.match('', [FILE_FIND_PATTERN]);
      expect(result.intent).toBe('UNKNOWN');
    });

    it('handles empty patterns', () => {
      const result = pipeline.match('查找文件', []);
      expect(result.intent).toBe('UNKNOWN');
    });
  });

  describe('param boost (Layer 4)', () => {
    it('boosts confidence when params are extractable from input', () => {
      const patternWithParams: IntentPattern = {
        intent: 'FILE_FIND',
        keywords: [{ text: '查找', tier: 'core' }],
        weight: 0.5,
        cli: ['find'],
      };
      const withCli = pipeline.match('用find查找', [patternWithParams]);
      const withoutCli = pipeline.match('查找', [patternWithParams]);
      expect(withCli.confidence).toBeGreaterThanOrEqual(withoutCli.confidence);
    });
  });
});
