import { describe, it, expect } from 'vitest';
import { createCapabilityRouter } from './router.js';
import { parseGoal } from '../core/goal-parser.js';
import { normalizeInput } from '../core/input-normalizer.js';

describe('createCapabilityRouter', () => {
  const router = createCapabilityRouter();

  describe('GitHub Actions 修复', () => {
    it('修复 git 上所有 actions 错误 -> github-actions-repair', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      expect(result.route).toBe('auto');
      expect(result.matchedCapability).toBe('github-actions-repair');
      expect(result.plan).not.toBeNull();
      expect(result.plan!.steps.length).toBeGreaterThanOrEqual(4);
    });

    it('把 CI 全部修绿 -> github-actions-repair', () => {
      const goal = parseGoal('把 CI 全部修绿');
      const result = router.route(goal);
      expect(result.route).toBe('auto');
      expect(result.matchedCapability).toBe('github-actions-repair');
    });

    it('处理 GitHub 上失败的 workflow -> github-actions-repair', () => {
      const goal = parseGoal('处理 GitHub 上失败的 workflow');
      const result = router.route(goal);
      expect(result.route).toBe('auto');
      expect(result.matchedCapability).toBe('github-actions-repair');
    });
  });

  describe('Git 操作', () => {
    it('提交代码 -> git-workflow', () => {
      const goal = parseGoal('提交代码');
      const result = router.route(goal);
      expect(result.route).toBe('auto');
      expect(result.matchedCapability).toBe('git-workflow');
      expect(result.plan).not.toBeNull();
    });
  });

  describe('不误判', () => {
    it('修复登录 bug -> 不应命中 github-actions-repair', () => {
      const goal = parseGoal('修复登录 bug');
      const result = router.route(goal);
      expect(result.matchedCapability).not.toBe('github-actions-repair');
    });
  });

  describe('运行测试', () => {
    it('运行测试 -> package-script', () => {
      const goal = parseGoal('运行测试');
      const result = router.route(goal);
      expect(result.route).toBe('auto');
      expect(result.matchedCapability).toBe('package-script');
    });
  });

  describe('github-actions-repair plan 结构', () => {
    it('plan 包含完整的修复阶段', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const plan = result.plan!;
      const stepLabels = plan.steps.map(s => s.label);
      expect(stepLabels.some(l => l.includes('discover') || l.includes('发现'))).toBe(true);
      expect(stepLabels.some(l => l.includes('fetch') || l.includes('获取'))).toBe(true);
      expect(stepLabels.some(l => l.includes('diagnos') || l.includes('分析'))).toBe(true);
      expect(stepLabels.some(l => l.includes('repair') || l.includes('修复') || l.includes('生成'))).toBe(true);
      expect(stepLabels.some(l => l.includes('report') || l.includes('报告'))).toBe(true);
    });

    it('plan userReport 有 summaryTemplate', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      expect(result.plan!.userReport.summaryTemplate).toBeTruthy();
    });
  });

  describe('模糊输入回退', () => {
    it('needsClarification 的 goal 回退', () => {
      const goal = parseGoal('搞一下');
      const result = router.route(goal);
      expect(result.route).toBe('fallback');
    });
  });

  describe('dry-run 输出', () => {
    it('auto 路由 plan 有 label', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      expect(result.plan!.label).toBeTruthy();
    });
  });
});
