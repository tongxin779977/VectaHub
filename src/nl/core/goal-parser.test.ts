import { describe, it, expect } from 'vitest';
import { parseGoal } from './goal-parser.js';
import { normalizeInput } from './input-normalizer.js';

describe('parseGoal', () => {
  describe('GitHub Actions 相关', () => {
    it('修复 git 上所有 actions 错误', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      expect(goal.action).toBe('repair');
      expect(goal.domains).toContain('github-actions');
      expect(goal.target).toBe('failure');
      expect(goal.scope).toBe('all');
      expect(goal.needsClarification).toBe(false);
    });

    it('把 CI 全部修绿', () => {
      const goal = parseGoal('把 CI 全部修绿');
      expect(goal.action).toBe('repair');
      expect(goal.domains).toContain('ci');
      expect(goal.scope).toBe('all');
      expect(goal.successCriteria).toContain('ci-green');
    });

    it('处理 GitHub 上失败的 workflow', () => {
      const goal = parseGoal('处理 GitHub 上失败的 workflow');
      expect(goal.action).toBe('repair');
      expect(goal.domains).toContain('github-actions');
      expect(goal.target).toBe('failure');
    });

    it('分析最新失败的 action', () => {
      const goal = parseGoal('分析最新失败的 action');
      expect(goal.action).toBe('analyze');
      expect(goal.domains).toContain('github-actions');
      expect(goal.scope).toBe('latest');
    });
  });

  describe('普通 Git 操作', () => {
    it('提交代码', () => {
      const goal = parseGoal('提交代码');
      expect(goal.domains).toContain('git');
      expect(goal.domains).not.toContain('github-actions');
    });
  });

  describe('非 CI 场景', () => {
    it('修复登录 bug', () => {
      const goal = parseGoal('修复登录 bug');
      expect(goal.action).toBe('repair');
      expect(goal.domains).not.toContain('github-actions');
    });
  });

  describe('运行测试', () => {
    it('运行测试', () => {
      const goal = parseGoal('运行测试');
      expect(goal.action).toBe('run');
      expect(goal.domains.some(d => d === 'npm' || d === 'test')).toBe(true);
    });
  });

  describe('置信度', () => {
    it('明确输入应有高置信度', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      expect(goal.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('模糊输入应触发 needsClarification', () => {
      const goal = parseGoal('搞一下');
      expect(goal.needsClarification).toBe(true);
    });
  });

  describe('接受 NormalizedInput 入参', () => {
    it('从 NormalizedInput 解析', () => {
      const normalized = normalizeInput('修复 git 上所有 actions 错误');
      const goal = parseGoal(normalized);
      expect(goal.action).toBe('repair');
      expect(goal.domains).toContain('github-actions');
    });
  });
});
