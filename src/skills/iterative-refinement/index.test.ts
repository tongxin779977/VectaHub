import { describe, it, expect, vi } from 'vitest';
import { createIterativeRefinementSkill } from './index.js';

describe('IterativeRefinementSkill', () => {
  it('应该能创建skill实例', () => {
    const skill = createIterativeRefinementSkill();

    expect(skill).toBeDefined();
    expect(typeof skill.execute).toBe('function');
    expect(typeof skill.analyzeError).toBe('function');
    expect(typeof skill.formatAnalysis).toBe('function');
    expect(typeof skill.getConfig).toBe('function');
  });

  it('应该能成功执行任务', async () => {
    const skill = createIterativeRefinementSkill();
    const taskFn = vi.fn().mockResolvedValue('task result');

    const result = await skill.execute(taskFn);

    expect(result.success).toBe(true);
    expect(result.result).toBe('task result');
    expect(taskFn).toHaveBeenCalledTimes(1);
  });

  it('应该能分析错误', () => {
    const skill = createIterativeRefinementSkill();

    const analysis = skill.analyzeError(
      'test_task',
      'ENOENT: no such file'
    );

    expect(analysis).toBeDefined();
    expect(analysis.taskId).toBe('test_task');
    expect(analysis.rootCauses.length).toBeGreaterThan(0);
  });

  it('应该能格式化分析结果', () => {
    const skill = createIterativeRefinementSkill();
    const analysis = skill.analyzeError('test', 'error');

    const formatted = skill.formatAnalysis(analysis);

    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('应该能自定义配置', () => {
    const skill = createIterativeRefinementSkill({
      maxAttempts: 10,
      initialBackoff: 2000,
    });

    const config = skill.getConfig();

    expect(config.maxAttempts).toBe(10);
    expect(config.initialBackoff).toBe(2000);
  });

  it('完整流程测试', async () => {
    const skill = createIterativeRefinementSkill({
      maxAttempts: 3,
      initialBackoff: 10,
      triggerAnalysisAfter: 2,
    });

    let attempt = 0;
    const taskFn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) {
        throw new Error('ENOENT: test file not found');
      }
      return 'finally succeeded';
    });

    const result = await skill.execute(taskFn, {
      taskId: 'integration_test',
    });

    expect(result.success).toBe(true);
    expect(result.totalAttempts).toBe(3);
    expect(result.result).toBe('finally succeeded');
    expect(result.analysis).toBeDefined();
  });
});
