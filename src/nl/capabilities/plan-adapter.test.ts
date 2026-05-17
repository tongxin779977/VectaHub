import { describe, it, expect } from 'vitest';
import { executionPlanToSteps, executionPlanToTaskList, getExecutableSteps, getInternalSteps } from './plan-adapter.js';
import { generateUserReport, formatDryRunText, formatJsonReport, formatExecutionResultText } from './user-report.js';
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

    it('github-actions-repair 执行链包含 diagnose/repair/verify/report', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const executableIds = executionPlanToSteps(result.plan!).map(step => step.id);
      expect(executableIds).toContain('diagnose');
      expect(executableIds).toContain('repair');
      expect(executableIds).toContain('verify');
      expect(executableIds).toContain('report');
    });

    it('fetch-logs 使用 discover-run-id 绑定的 ${runId}', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const plan = result.plan!;
      const discover = plan.steps.find(step => step.id === 'discover-run-id');
      const fetchLogs = plan.steps.find(step => step.id === 'fetch-logs');
      expect(discover?.outputVar).toBe('runId');
      expect(fetchLogs?.command?.args).toContain('${runId}');
    });
  });

  describe('7.1 github-actions-repair 执行步骤保持真实命令', () => {
    it('executionPlanToSteps 不包含 echo [internal] 伪执行', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const steps = executionPlanToSteps(result.plan!);
      expect(steps.some(s => s.cli === 'echo' && s.args?.some(a => String(a).includes('[internal]')))).toBe(false);
    });

    it('internal steps 应为空（改为真实 command 执行）', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const internals = getInternalSteps(result.plan!);
      expect(internals).toHaveLength(0);
    });

    it('executable steps 覆盖完整链路', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const execs = getExecutableSteps(result.plan!);
      expect(execs.map(s => s.id)).toEqual([
        'discover-run-id',
        'fetch-logs',
        'diagnose',
        'repair',
        'verify',
        'report',
      ]);
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

    it('保留 command 级 outputVar 绑定', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const taskList = executionPlanToTaskList(result.plan!);
      const commands = taskList.tasks[0]?.commands ?? [];
      const discoverCommand = commands.find(command => command.outputVar === 'runId');
      expect(discoverCommand).toBeDefined();
      expect(commands.some(command => command.args.includes('${runId}'))).toBe(true);
    });
  });

  describe('7.4 git-workflow 不自动提交', () => {
    it('提交代码不生成 git add .', () => {
      const goal = parseGoal('提交代码');
      const result = router.route(goal);
      const steps = executionPlanToSteps(result.plan!);
      expect(steps.some(s => s.cli === 'git' && s.args?.includes('add'))).toBe(false);
    });

    it('提交代码不生成 git commit', () => {
      const goal = parseGoal('提交代码');
      const result = router.route(goal);
      const steps = executionPlanToSteps(result.plan!);
      expect(steps.some(s => s.cli === 'git' && s.args?.includes('commit'))).toBe(false);
    });

    it('提交代码 plan 仅包含只读 git status', () => {
      const goal = parseGoal('提交代码');
      const result = router.route(goal);
      const plan = result.plan!;
      const execSteps = getExecutableSteps(plan);
      expect(execSteps.length).toBe(1);
      expect(execSteps[0].id).toBe('status');
      expect(execSteps[0].command?.cli).toBe('git');
      expect(execSteps[0].command?.args).toContain('status');
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

  describe('7.2 dry-run 展示完整阶段', () => {
    it('dry-run 包含所有阶段 label', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const text = formatDryRunText(result.plan!);
      expect(text).toContain('发现最新失败的 GitHub Actions Run ID');
      expect(text).toContain('获取失败日志');
      expect(text).toContain('收集失败 Run 诊断信息');
      expect(text).toContain('重试失败作业');
      expect(text).toContain('验证重试结果');
      expect(text).toContain('输出修复报告');
    });

    it('dry-run 不展示内部命令详情', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const text = formatDryRunText(result.plan!);
      expect(text).not.toContain('gh run list');
      expect(text).not.toContain('${runId}');
      expect(text).not.toMatch(/gh run view/);
    });
  });

  describe('7.3 普通输出隐藏 internal stdout', () => {
    it('formatExecutionResultText 隐藏 internalOutput step', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const fakeResults = [
        { stepId: 'discover-run-id', status: 'COMPLETED' as const, output: ['123456789'], duration: 100 },
        { stepId: 'fetch-logs', status: 'COMPLETED' as const, output: ['log line 1', 'log line 2'], duration: 100 },
        { stepId: 'diagnose', status: 'COMPLETED' as const, output: ['diagnostic info'], duration: 100 },
        { stepId: 'report', status: 'COMPLETED' as const, output: ['report summary'], duration: 100 },
      ];
      const text = formatExecutionResultText(result.plan!, fakeResults);
      expect(text).not.toContain('123456789');
      expect(text).not.toContain('log line 1');
      expect(text).not.toContain('diagnostic info');
      expect(text).toContain('report summary');
    });

    it('formatJsonReport 保留完整 step 信息', () => {
      const goal = parseGoal('修复 git 上所有 actions 错误');
      const result = router.route(goal);
      const json = formatJsonReport(result.plan!);
      const planData = json.plan as Record<string, unknown>;
      const steps = planData.steps as Array<Record<string, unknown>>;
      expect(steps.length).toBeGreaterThan(3);
    });
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
