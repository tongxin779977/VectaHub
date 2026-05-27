import { describe, it, expect } from 'vitest';
import { createGitWorkflowCapability } from './git-workflow.js';
import { parseGoal } from '../core/goal-parser.js';

describe('createGitWorkflowCapability', () => {
  const capability = createGitWorkflowCapability();

  describe('canHandle', () => {
    it('应该匹配包含 git domain 的目标', () => {
      const goal = parseGoal('提交代码');
      const match = capability.canHandle(goal);
      expect(match.capabilityId).toBe('git-workflow');
      expect(match.score).toBeGreaterThan(0);
    });

    it('应该为包含 git 操作的目标匹配', () => {
      const goal = parseGoal('push 代码');
      const match = capability.canHandle(goal);
      expect(match.score).toBeGreaterThan(0);
    });

    it('不应该匹配包含 github-actions 或 ci domain 的目标', () => {
      const goal = parseGoal('修复 CI 错误');
      const match = capability.canHandle(goal);
      expect(match.score).toBe(0);
    });

    it('不应该匹配不相关的目标', () => {
      const goal = parseGoal('安装 npm 包');
      const match = capability.canHandle(goal);
      expect(match.score).toBe(0);
    });
  });

  describe('plan', () => {
    it('应该生成包含 git status 步骤的计划', () => {
      const goal = parseGoal('提交代码');
      const plan = capability.plan(goal);
      
      expect(plan.id).toContain('git-wf');
      expect(plan.label).toBeTruthy();
      expect(plan.capabilityId).toBe('git-workflow');
      expect(plan.steps.length).toBeGreaterThan(0);
      
      const stepLabels = plan.steps.map(s => s.label);
      expect(stepLabels.some(l => l.includes('Git') || l.includes('git'))).toBe(true);
    });

    it('应该包含 userReport 信息', () => {
      const goal = parseGoal('提交代码');
      const plan = capability.plan(goal);
      
      expect(plan.userReport.summaryTemplate).toBeTruthy();
      expect(plan.userReport.nextActions).toBeTruthy();
      expect(plan.userReport.verificationSteps).toBeTruthy();
    });
  });
});
