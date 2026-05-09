import { describe, it, expect } from 'vitest';
import { parseGoal } from '../nl/core/goal-parser.js';
import { createCapabilityRouter } from '../nl/capabilities/router.js';
import { executionPlanToSteps } from '../nl/capabilities/plan-adapter.js';
import { formatDryRunText, formatJsonReport } from '../nl/capabilities/user-report.js';

const router = createCapabilityRouter();

describe('Goal Router integration with run command', () => {
  const cases = [
    { input: '修复 git 上所有 actions 错误', expectCapability: 'github-actions-repair' },
    { input: '把 CI 全部修绿', expectCapability: 'github-actions-repair' },
    { input: '处理 GitHub 上失败的 workflow', expectCapability: 'github-actions-repair' },
    { input: '分析最新失败的 action', expectCapability: 'github-actions-repair' },
    { input: '提交代码', expectCapability: 'git-workflow' },
    { input: '运行测试', expectCapability: 'package-script' },
  ];

  for (const { input, expectCapability } of cases) {
    it(`"${input}" -> ${expectCapability}`, () => {
      const goal = parseGoal(input);
      const result = router.route(goal);
      expect(result.route).toBe('auto');
      expect(result.matchedCapability).toBe(expectCapability);
      expect(result.plan).not.toBeNull();
    });
  }

  it('修复登录 bug 不应进入 github-actions-repair', () => {
    const goal = parseGoal('修复登录 bug');
    const result = router.route(goal);
    expect(result.matchedCapability).not.toBe('github-actions-repair');
  });

  it('auto 路由能生成 Steps', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    const result = router.route(goal);
    const steps = executionPlanToSteps(result.plan!);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].type).toBe('exec');
  });

  it('dry-run 输出包含计划摘要', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    const result = router.route(goal);
    const text = formatDryRunText(result.plan!);
    expect(text).toContain('执行计划');
    expect(text).toContain('Dry-run');
  });

  it('json 输出包含 userReport', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    const result = router.route(goal);
    const json = formatJsonReport(result.plan!);
    expect(json.userReport).toBeDefined();
    expect((json.userReport as Record<string, string>).summary).toBeTruthy();
  });
});
