import { describe, it, expect } from 'vitest';
import { createIntentSplitter } from './intent-splitter.js';

describe('IntentSplitter', () => {
  const splitter = createIntentSplitter();

  describe('connector-based splitting', () => {
    it('splits on "并"', () => {
      const result = splitter.split('查找文件并提交');
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses![0].text).toBe('查找文件');
      expect(result.clauses![1].text).toBe('提交');
      expect(result.clauses![1].connector).toBe('并');
      expect(result.isMultiIntent).toBe(true);
    });

    it('splits on "然后"', () => {
      const result = splitter.split('安装依赖然后构建');
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses![0].text).toBe('安装依赖');
      expect(result.clauses![1].text).toBe('构建');
      expect(result.clauses![1].connector).toBe('然后');
    });

    it('splits on "再"', () => {
      const result = splitter.split('创建文件再修改权限');
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses![0].text).toBe('创建文件');
      expect(result.clauses![1].text).toBe('修改权限');
    });

    it('splits on "并且"', () => {
      const result = splitter.split('压缩目录并且提交');
      expect(result.clauses).toHaveLength(2);
    });

    it('splits on English "and"', () => {
      const result = splitter.split('find files and commit');
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses![0].text).toBe('find files');
      expect(result.clauses![1].text).toBe('commit');
    });

    it('splits on "然后帮我"', () => {
      const result = splitter.split('查找文件然后帮我提交');
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses![1].text).toBe('提交');
    });

    it('handles three-part split', () => {
      const result = splitter.split('查找文件并提交并推送');
      expect(result.clauses).toHaveLength(3);
    });
  });

  describe('single intent (no split)', () => {
    it('does not split single intent', () => {
      const result = splitter.split('查找文件');
      expect(result.isMultiIntent).toBe(false);
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses![0].text).toBe('查找文件');
    });

    it('does not split input without connectors', () => {
      const result = splitter.split('提交代码到仓库');
      expect(result.isMultiIntent).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = splitter.split('');
      expect(result.isMultiIntent).toBe(false);
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses![0].text).toBe('');
    });

    it('handles whitespace-only input', () => {
      const result = splitter.split('   ');
      expect(result.isMultiIntent).toBe(false);
    });

    it('trims clause text', () => {
      const result = splitter.split('查找文件 并 提交');
      expect(result.clauses![0].text).toBe('查找文件');
      expect(result.clauses![1].text).toBe('提交');
    });

    it('tracks positions correctly', () => {
      const result = splitter.split('查找文件并提交');
      expect(result.clauses![0].position.start).toBe(0);
      expect(result.clauses![0].position.end).toBe(4);
      expect(result.clauses![1].position.start).toBe(5);
    });

    it('preserves rawInput', () => {
      const input = '查找文件并提交';
      const result = splitter.split(input);
      expect(result.rawInput).toBe(input);
    });
  });
});
