import { describe, it, expect } from 'vitest';
import { executionPlanToSteps, executionPlanToTaskList } from './plan-adapter.js';
import { generateUserReport, formatDryRunText, formatJsonReport } from './user-report.js';
import { createCapabilityRouter } from './router.js';
import { parseGoal } from '../core/goal-parser.js';

describe('plan-adapter', () => {
  const router = createCapabilityRouter();

  describe('executionPlanToSteps', () => {
    it('将 ExecutionPlan 转换为 Step[]', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const steps = executionPlanToSteps(result.plan!);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].type).toBe('exec');
      expect(steps[0].cli).toBeTruthy();
    });

    it('command 步骤保留 cli 和 args', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const steps = executionPlanToSteps(result.plan!);
      const cmdStep = steps.find(s => s.cli === 'gh');
      expect(cmdStep).toBeDefined();
      expect(cmdStep!.args).toContain('run');
    });
  });

  describe('executionPlanToTaskList', () => {
    it('转换为有效 TaskList', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const taskList = executionPlanToTaskList(result.plan!);
      expect(taskList.version).toBe('1.0.0');
      expect(taskList.tasks.length).toBeGreaterThan(0);
      expect(taskList.tasks[0].type).toBe('CODE_TRANSFORM');
      expect(taskList.tasks[0].status).toBe('PENDING');
    });
  });
});

describe('user-report', () => {
  const router = createCapabilityRouter();

  it('generateUserReport 返回标题和阶段', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    const result = router.route(goal);
    const report = generateUserReport(result.plan!);
    expect(report.title).toBeTruthy();
    expect(report.phases.length).toBeGreaterThan(0);
    expect(report.summary).toBeTruthy();
  });

  it('formatDryRunText 包含 dry-run 提示', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    const result = router.route(goal);
    const text = formatDryRunText(result.plan!);
    expect(text).toContain('执行计划');
    expect(text).toContain('Dry-run');
    expect(text).not.toMatch(/gh run list.*\d{7,}/);
  });

  it('formatJsonReport 包含完整 plan', () => {
    const goal = parseGoal('修复 git 上所有 actions 错误');
    const result = router.route(goal);
    const json = formatJsonReport(result.plan!);
    expect(json.plan).toBeDefined();
    expect(json.userReport).toBeDefined();
    expect((json.plan as Record<string, unknown>).id).toBeTruthy();
  });
});
