import { describe, it, expect } from 'vitest';
import { createPackageScriptCapability } from './package-script.js';
import { parseGoal } from '../core/goal-parser.js';

describe('createPackageScriptCapability', () => {
  const capability = createPackageScriptCapability();

  describe('canHandle', () => {
    it('应该匹配包含 npm domain 的目标', () => {
      const goal = parseGoal('运行 npm test');
      const match = capability.canHandle(goal);
      expect(match.capabilityId).toBe('package-script');
      expect(match.score).toBeGreaterThan(0);
    });

    it('应该匹配包含 test domain 的目标', () => {
      const goal = parseGoal('运行测试');
      const match = capability.canHandle(goal);
      expect(match.score).toBeGreaterThan(0);
    });

    it('应该为 run action 提高分数', () => {
      const goal = parseGoal('运行测试');
      const match = capability.canHandle(goal);
      expect(match.score).toBeGreaterThan(0.5);
    });

    it('不应该匹配不相关的目标', () => {
      const goal = parseGoal('提交代码');
      const match = capability.canHandle(goal);
      expect(match.score).toBe(0);
    });
  });

  describe('plan', () => {
    it('应该生成包含运行脚本步骤的计划', () => {
      const goal = parseGoal('运行测试');
      const plan = capability.plan(goal);
      
      expect(plan.id).toContain('pkg-script');
      expect(plan.label).toBeTruthy();
      expect(plan.capabilityId).toBe('package-script');
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('应该使用 npm 作为默认的包管理器', () => {
      const goal = parseGoal('运行测试');
      const plan = capability.plan(goal);
      
      const step = plan.steps.find(s => s.command?.cli === 'npm');
      expect(step).toBeTruthy();
      expect(step?.command?.args).toContain('run');
    });

    it('应该使用提供的项目上下文', () => {
      const goal = parseGoal('运行测试');
      const plan = capability.plan(goal, { packageManager: 'yarn' });
      
      const step = plan.steps.find(s => s.command?.cli === 'yarn');
      expect(step).toBeTruthy();
    });

    it('应该包含 userReport 信息', () => {
      const goal = parseGoal('运行测试');
      const plan = capability.plan(goal);
      
      expect(plan.userReport.summaryTemplate).toBeTruthy();
      expect(plan.userReport.nextActions).toBeTruthy();
      expect(plan.userReport.verificationSteps).toBeTruthy();
    });
  });
});
