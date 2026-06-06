import { describe, it, expect } from 'vitest';
import { createGitHubActionsRepairCapability } from './github-actions-repair.js';
import { parseGoal } from '../core/goal-parser.js';

describe('createGitHubActionsRepairCapability', () => {
  const capability = createGitHubActionsRepairCapability();

  describe('canHandle', () => {
    it('应该匹配包含 github-actions domain 和 repair action 的目标', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const match = capability.canHandle(goal);
      expect(match.capabilityId).toBe('github-actions-repair');
      expect(match.score).toBeGreaterThan(0);
    });

    it('应该匹配包含 ci domain 的目标', () => {
      const goal = parseGoal('把 CI 全部修绿');
      const match = capability.canHandle(goal);
      expect(match.score).toBeGreaterThan(0);
    });

    it('不应该匹配不相关的目标', () => {
      const goal = parseGoal('修复登录 bug');
      const match = capability.canHandle(goal);
      expect(match.score).toBe(0);
    });

    it('应该为包含 github-actions evidence 的目标提高分数', () => {
      const goal = parseGoal('修复这个失败的 workflow https://github.com/actions/runs/12345');
      const match = capability.canHandle(goal);
      expect(match.score).toBeGreaterThan(0.7);
    });
  });

  describe('plan', () => {
    it('应该生成包含完整修复阶段的计划', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const plan = capability.plan(goal);
      
      expect(plan.id).toContain('gh-repair');
      expect(plan.label).toBeTruthy();
      expect(plan.capabilityId).toBe('github-actions-repair');
      expect(plan.steps.length).toBeGreaterThan(0);
      
      const stepLabels = plan.steps.map(s => s.label);
      expect(stepLabels.some(l => l.includes('发现') || l.includes('discover'))).toBe(true);
      expect(stepLabels.some(l => l.includes('获取') || l.includes('fetch'))).toBe(true);
      expect(stepLabels.some(l => l.includes('诊断') || l.includes('diagnos'))).toBe(true);
      expect(stepLabels.some(l => l.includes('修复') || l.includes('repair') || l.includes('重试'))).toBe(true);
      expect(stepLabels.some(l => l.includes('报告') || l.includes('report'))).toBe(true);
    });

    it('应该包含 userReport 信息', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const plan = capability.plan(goal);
      
      expect(plan.userReport.summaryTemplate).toBeTruthy();
      expect(plan.userReport.nextActions).toBeTruthy();
      expect(plan.userReport.verificationSteps).toBeTruthy();
    });
  });
});
