import { describe, it, expect } from 'vitest';
import { parseGoal } from './goal-parser.js';

describe('Goal Parser Domain Conflict Rules', () => {
  it('should route "修复 git 上所有 actions 错误" to github-actions', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    expect(goal.domains).toContain('github-actions');
  });

  it('should route "把 CI 全部修绿" to github-actions', () => {
    const goal = parseGoal('把 CI 全部修绿');
    expect(goal.domains).toContain('github-actions');
  });

  it('should route "处理 GitHub 上失败的 workflow" to github-actions', () => {
    const goal = parseGoal('处理 GitHub 上失败的 workflow');
    expect(goal.domains).toContain('github-actions');
  });

  it('should route "提交代码" to git only', () => {
    const goal = parseGoal('提交代码');
    expect(goal.domains).toContain('git');
    expect(goal.domains).not.toContain('github-actions');
  });

  it('should NOT route "修复登录 bug" to github-actions', () => {
    const goal = parseGoal('修复登录 bug');
    expect(goal.domains).not.toContain('github-actions');
  });

  it('should NOT route "运行测试" to github-actions', () => {
    const goal = parseGoal('运行测试');
    expect(goal.domains).not.toContain('github-actions');
  });
});
