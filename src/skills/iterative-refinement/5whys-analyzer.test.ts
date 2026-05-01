import { describe, it, expect } from 'vitest';
import { createFiveWhysAnalyzer } from './5whys-analyzer.js';

describe('5WhysAnalyzer', () => {
  const analyzer = createFiveWhysAnalyzer();

  describe('analyze', () => {
    it('应该能分析文件不存在错误', () => {
      const result = analyzer.analyze(
        'test_task_001',
        'ENOENT: no such file or directory, open \'missing.txt\''
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.taskId).toBe('test_task_001');
      expect(result.whyChain.length).toBe(5);
      expect(result.rootCauses.length).toBeGreaterThan(0);
      expect(result.rootCauses[0].category).toBe('CONFIGURATION');
    });

    it('应该能分析权限错误', () => {
      const result = analyzer.analyze(
        'test_task_002',
        'EACCES: permission denied, access \'/root/file.txt\''
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.rootCauses[0].category).toBe('PERMISSION');
    });

    it('应该能分析网络错误', () => {
      const result = analyzer.analyze(
        'test_task_003',
        'connection refused: could not connect to server'
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.rootCauses[0].category).toBe('NETWORK');
    });

    it('应该能分析模块找不到错误', () => {
      const result = analyzer.analyze(
        'test_task_004',
        'Cannot find module \'missing-package\''
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.rootCauses[0].category).toBe('DEPENDENCY');
    });

    it('应该能分析语法错误', () => {
      const result = analyzer.analyze(
        'test_task_005',
        'SyntaxError: Unexpected token'
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.rootCauses[0].category).toBe('LOGIC');
    });

    it('应该能分析命令找不到错误', () => {
      const result = analyzer.analyze(
        'test_task_006',
        'command not found: missing-command'
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.rootCauses[0].category).toBe('ENVIRONMENT');
    });

    it('对未知错误应该返回UNKNOWN类别', () => {
      const result = analyzer.analyze(
        'test_task_007',
        'some weird error that no one understands'
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.rootCauses[0].category).toBe('UNKNOWN');
    });

    it('每个why应该有id和question', () => {
      const result = analyzer.analyze(
        'test_task_008',
        'test error'
      );

      result.whyChain.forEach((why, index) => {
        expect(why.id).toBe(index + 1);
        expect(why.question).toBeTruthy();
        expect(why.answer).toBeTruthy();
      });
    });

    it('应该包含建议的修复方案', () => {
      const result = analyzer.analyze(
        'test_task_009',
        'ENOENT: no such file'
      );

      expect(result.rootCauses[0].suggestedFixes.length).toBeGreaterThan(0);
    });

    it('应该有置信度分数', () => {
      const result = analyzer.analyze(
        'test_task_010',
        'ENOENT: no such file'
      );

      expect(result.rootCauses[0].confidence).toBeGreaterThanOrEqual(0);
      expect(result.rootCauses[0].confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('formatAnalysis', () => {
    it('应该能格式化分析结果', () => {
      const analysis = analyzer.analyze(
        'format_test',
        'test error message'
      );

      const formatted = analyzer.formatAnalysis(analysis);

      expect(formatted).toContain('5 Whys 根因分析');
      expect(formatted).toContain('format_test');
      expect(formatted).toContain('test error message');
    });

    it('格式化输出应该包含所有5个why', () => {
      const analysis = analyzer.analyze(
        'format_test_2',
        'test error'
      );

      const formatted = analyzer.formatAnalysis(analysis);

      for (let i = 1; i <= 5; i++) {
        expect(formatted).toContain(`${i}.`);
      }
    });
  });
});
