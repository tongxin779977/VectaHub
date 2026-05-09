import { describe, it, expect } from 'vitest';
import { normalizeInput } from './input-normalizer.js';

describe('normalizeInput', () => {
  describe('同义词归一化', () => {
    it('修复 git 上所有 actions 错误', () => {
      const result = normalizeInput('修复 git 上所有 actions 错误');
      expect(result.normalizedTerms).toContain('repair');
      expect(result.normalizedTerms).toContain('github');
      expect(result.normalizedTerms).toContain('ci');
      expect(result.normalizedTerms).toContain('failure');
      expect(result.normalizedTerms).toContain('all');
    });

    it('修复登录 bug 不应包含 ci', () => {
      const result = normalizeInput('修复登录 bug');
      expect(result.normalizedTerms).toContain('repair');
      expect(result.normalizedTerms).not.toContain('ci');
    });

    it('把 CI 全部修绿', () => {
      const result = normalizeInput('把 CI 全部修绿');
      expect(result.normalizedTerms).toContain('repair');
      expect(result.normalizedTerms).toContain('ci');
      expect(result.normalizedTerms).toContain('all');
    });

    it('处理 GitHub 上失败的 workflow', () => {
      const result = normalizeInput('处理 GitHub 上失败的 workflow');
      expect(result.normalizedTerms).toContain('repair');
      expect(result.normalizedTerms).toContain('github');
      expect(result.normalizedTerms).toContain('failure');
    });

    it('提交代码', () => {
      const result = normalizeInput('提交代码');
      expect(result.normalizedTerms).toContain('git');
      expect(result.normalizedTerms).not.toContain('ci');
    });
  });

  describe('实体提取', () => {
    it('提取 GitHub Actions run URL', () => {
      const result = normalizeInput('分析 https://github.com/a/b/actions/runs/1234567890');
      expect(result.entities.githubActionUrls).toContain('https://github.com/a/b/actions/runs/1234567890');
      expect(result.entities.githubActionRunIds).toContain('1234567890');
    });

    it('提取带上下文的 run id', () => {
      const result = normalizeInput('查看 actions 1234567890 的日志');
      expect(result.entities.githubActionRunIds).toContain('1234567890');
    });

    it('不提取无上下文的普通数字', () => {
      const result = normalizeInput('修复登录 bug 3 次');
      expect(result.entities.githubActionRunIds).toBeUndefined();
    });

    it('提取 commit SHA', () => {
      const result = normalizeInput('回滚到 abc1234def56789012345678901234567890abcd');
      expect(result.entities.commitShas).toContain('abc1234def56789012345678901234567890abcd');
    });
  });

  describe('tokens 和 cleanText', () => {
    it('保留原始文本', () => {
      const result = normalizeInput('  hello  world  ');
      expect(result.rawText).toBe('  hello  world  ');
    });

    it('清洗后文本', () => {
      const result = normalizeInput('  hello  world  ');
      expect(result.cleanText).toBe('hello world');
    });

    it('tokens 去除标点', () => {
      const result = normalizeInput('hello, world!');
      expect(result.tokens).toContain('hello');
      expect(result.tokens).toContain('world');
    });
  });
});
