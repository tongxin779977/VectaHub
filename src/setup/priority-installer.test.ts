import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPriorityInstaller,
  createDefaultInstaller,
  type InstallationStep,
  type InstallationPhase,
  type InstallationSummary,
  type PhaseResult,
  type StepResult,
  type Installer,
} from './priority-installer.js';
import { getDefaultContext } from '../infrastructure/context.js';

// Mock first-run-wizard modules used by createDefaultInstaller
vi.mock('./first-run-wizard.js', () => ({
  createConfigDir: vi.fn().mockResolvedValue({ success: true }),
  initConfigFile: vi.fn().mockResolvedValue({ success: true }),
  configureLLMProvider: vi.fn().mockResolvedValue({ success: true }),
  loadConfig: vi.fn().mockReturnValue({
    version: 1,
    first_run_completed: false,
    ai_providers: { vectahub_llm: { provider: '', enabled: false } },
    external_cli: {},
    priority: [],
  }),
  saveConfig: vi.fn(),
  closeRl: vi.fn(),
}));

// Mock cli-scanner modules used by createDefaultInstaller
vi.mock('./cli-scanner.js', () => ({
  scanCLITools: vi.fn().mockResolvedValue([]),
  updateCLIToolConfig: vi.fn(),
}));

// Mock readline used by createDefaultInstaller's askRetry
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('PriorityInstaller', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // Helper to create a successful step
  function successStep(id: string, priority: InstallationPhase): InstallationStep {
    return {
      id,
      name: `Step ${id}`,
      priority,
      execute: vi.fn().mockResolvedValue({ success: true }),
    };
  }

  // Helper to create a failing step
  function failStep(
    id: string,
    priority: InstallationPhase,
    reason = 'something went wrong',
    retryable?: boolean,
  ): InstallationStep {
    return {
      id,
      name: `Step ${id}`,
      priority,
      execute: vi.fn().mockResolvedValue({ success: false, reason }),
      retryable,
    };
  }

  describe('type definitions', () => {
    it('should export correct types at compile time', () => {
      // Compile-time check: if this compiles, types are correct
      const phase: InstallationPhase = 'critical';
      const stepResult: StepResult = { success: true };
      const stepResultWithReason: StepResult = { success: false, reason: 'err' };
      const phaseResult: PhaseResult = { total: 1, succeeded: 1, failed: 0 };
      const summary: InstallationSummary = {
        phases: {
          critical: { total: 0, succeeded: 0, failed: 0 },
          secondary: { total: 0, succeeded: 0, failed: 0 },
          tertiary: { total: 0, succeeded: 0, failed: 0 },
        },
        overallSuccess: true,
      };

      expect(phase).toBe('critical');
      expect(stepResult.success).toBe(true);
      expect(stepResultWithReason.reason).toBe('err');
      expect(phaseResult.total).toBe(1);
      expect(summary.overallSuccess).toBe(true);
    });
  });

  describe('critical phase', () => {
    it('all succeed -> proceeds to secondary and tertiary', async () => {
      const critical1 = successStep('c1', 'critical');
      const secondary1 = successStep('s1', 'secondary');
      const tertiary1 = successStep('t1', 'tertiary');

      const installer = createPriorityInstaller([critical1, secondary1, tertiary1]);
      const result = await installer.run();

      expect(result.overallSuccess).toBe(true);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(result.phases.secondary).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(result.phases.tertiary).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(critical1.execute).toHaveBeenCalledTimes(1);
      expect(secondary1.execute).toHaveBeenCalledTimes(1);
      expect(tertiary1.execute).toHaveBeenCalledTimes(1);
    });

    it('one fails -> blocks subsequent phases, overallSuccess=false', async () => {
      const criticalOk = successStep('c-ok', 'critical');
      const criticalFail = failStep('c-fail', 'critical', 'config error');
      const secondary1 = successStep('s1', 'secondary');
      const tertiary1 = successStep('t1', 'tertiary');

      const installer = createPriorityInstaller([criticalOk, criticalFail, secondary1, tertiary1]);
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.critical).toEqual({ total: 2, succeeded: 1, failed: 1 });
      expect(result.phases.secondary).toEqual({ total: 1, succeeded: 0, failed: 0 });
      expect(result.phases.tertiary).toEqual({ total: 1, succeeded: 0, failed: 0 });
      // secondary and tertiary should not have been executed
      expect(secondary1.execute).not.toHaveBeenCalled();
      expect(tertiary1.execute).not.toHaveBeenCalled();
    });

    it('fails with retryable=true, retry succeeds -> proceeds', async () => {
      let callCount = 0;
      const retryableStep: InstallationStep = {
        id: 'c-retry',
        name: 'Step c-retry',
        priority: 'critical',
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ success: false, reason: 'transient error' });
          }
          return Promise.resolve({ success: true });
        }),
        retryable: true,
      };
      const secondary1 = successStep('s1', 'secondary');

      const askRetry = vi.fn().mockResolvedValue(true);
      const installer = createPriorityInstaller([retryableStep, secondary1], { askRetry });
      const result = await installer.run();

      expect(result.overallSuccess).toBe(true);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(retryableStep.execute).toHaveBeenCalledTimes(2);
      expect(askRetry).toHaveBeenCalledWith('Step c-retry');
      expect(secondary1.execute).toHaveBeenCalledTimes(1);
    });

    it('fails with retryable=true, user declines retry -> blocks', async () => {
      const retryableStep = failStep('c-retry-decline', 'critical', 'error', true);
      const secondary1 = successStep('s1', 'secondary');

      const askRetry = vi.fn().mockResolvedValue(false);
      const installer = createPriorityInstaller([retryableStep, secondary1], { askRetry });
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 0, failed: 1 });
      expect(retryableStep.execute).toHaveBeenCalledTimes(1);
      expect(secondary1.execute).not.toHaveBeenCalled();
    });

    it('fails with retryable=true, retry also fails -> blocks', async () => {
      const retryableStep = failStep('c-retry-fail', 'critical', 'persistent error', true);
      const secondary1 = successStep('s1', 'secondary');

      const askRetry = vi.fn().mockResolvedValue(true);
      const installer = createPriorityInstaller([retryableStep, secondary1], { askRetry, maxRetries: 1 });
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 0, failed: 1 });
      expect(retryableStep.execute).toHaveBeenCalledTimes(2);
      expect(secondary1.execute).not.toHaveBeenCalled();
    });

    it('respects maxRetries limit', async () => {
      const retryableStep = failStep('c-max-retries', 'critical', 'persistent error', true);
      const secondary1 = successStep('s1', 'secondary');
      const maxRetries = 3;

      const askRetry = vi.fn().mockResolvedValue(true);
      const installer = createPriorityInstaller([retryableStep, secondary1], { askRetry, maxRetries });
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 0, failed: 1 });
      expect(retryableStep.execute).toHaveBeenCalledTimes(maxRetries + 1); // initial + retries
      expect(askRetry).toHaveBeenCalledTimes(maxRetries);
      expect(secondary1.execute).not.toHaveBeenCalled();
    });

    it('uses default maxRetries of 3 when not specified', async () => {
      const retryableStep = failStep('c-default-retries', 'critical', 'persistent error', true);
      const secondary1 = successStep('s1', 'secondary');

      const askRetry = vi.fn().mockResolvedValue(true);
      const installer = createPriorityInstaller([retryableStep, secondary1], { askRetry });
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 0, failed: 1 });
      expect(retryableStep.execute).toHaveBeenCalledTimes(4); // default 3 retries + initial
      expect(secondary1.execute).not.toHaveBeenCalled();
    });

    it('fails with retryable unspecified defaults to true for critical, askRetry triggers', async () => {
      let callCount = 0;
      const stepNoRetryable: InstallationStep = {
        id: 'c-default',
        name: 'Step c-default',
        priority: 'critical',
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ success: false, reason: 'fail once' });
          }
          return Promise.resolve({ success: true });
        }),
        // retryable not specified, defaults to true for critical
      };
      const askRetry = vi.fn().mockResolvedValue(true);
      const installer = createPriorityInstaller([stepNoRetryable], { askRetry });
      const result = await installer.run();

      expect(result.overallSuccess).toBe(true);
      expect(askRetry).toHaveBeenCalledWith('Step c-default');
      expect(stepNoRetryable.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('secondary phase', () => {
    it('partial failures -> continues to tertiary', async () => {
      const critical1 = successStep('c1', 'critical');
      const secondaryOk = successStep('s-ok', 'secondary');
      const secondaryFail = failStep('s-fail', 'secondary', 'tool not found');
      const tertiary1 = successStep('t1', 'tertiary');

      const installer = createPriorityInstaller([critical1, secondaryOk, secondaryFail, tertiary1]);
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(result.phases.secondary).toEqual({ total: 2, succeeded: 1, failed: 1 });
      expect(result.phases.tertiary).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(tertiary1.execute).toHaveBeenCalledTimes(1);
    });

    it('all fail -> still continues to tertiary', async () => {
      const critical1 = successStep('c1', 'critical');
      const secondaryFail1 = failStep('s-f1', 'secondary', 'err1');
      const secondaryFail2 = failStep('s-f2', 'secondary', 'err2');
      const tertiary1 = successStep('t1', 'tertiary');

      const installer = createPriorityInstaller([critical1, secondaryFail1, secondaryFail2, tertiary1]);
      const result = await installer.run();

      expect(result.overallSuccess).toBe(false);
      expect(result.phases.secondary).toEqual({ total: 2, succeeded: 0, failed: 2 });
      expect(tertiary1.execute).toHaveBeenCalledTimes(1);
    });

    it('retryable is not prompted for secondary failures', async () => {
      const critical1 = successStep('c1', 'critical');
      const secondaryFail = failStep('s-fail', 'secondary', 'err', true);
      const askRetry = vi.fn().mockResolvedValue(true);

      const installer = createPriorityInstaller([critical1, secondaryFail], { askRetry });
      const result = await installer.run();

      // secondary failures never trigger askRetry, even if retryable=true
      expect(askRetry).not.toHaveBeenCalled();
      expect(result.phases.secondary.failed).toBe(1);
    });
  });

  describe('tertiary phase', () => {
    it('failure -> continues, logged but not blocking overallSuccess', async () => {
      const critical1 = successStep('c1', 'critical');
      const secondary1 = successStep('s1', 'secondary');
      const tertiaryFail = failStep('t-fail', 'tertiary', 'optional missing');

      const installer = createPriorityInstaller([critical1, secondary1, tertiaryFail]);
      const result = await installer.run();

      // Tertiary failures are silent, overallSuccess should still be true
      expect(result.overallSuccess).toBe(true);
      expect(result.phases.tertiary).toEqual({ total: 1, succeeded: 0, failed: 1 });
    });

    it('failure is logged with console.warn', async () => {
      const critical1 = successStep('c1', 'critical');
      const tertiaryFail = failStep('t-fail', 'tertiary', 'optional missing');

      const installer = createPriorityInstaller([critical1, tertiaryFail]);
      await installer.run();

      expect(warnSpy).toHaveBeenCalled();
      const warnCalls = warnSpy.mock.calls.map((c: any) => c[0]) as string[];
      expect(warnCalls.some((msg) => msg.includes('可选组件') && msg.includes('Step t-fail'))).toBe(true);
    });
  });

  describe('logging', () => {
    it('logs step start, success, and phase summary', async () => {
      const critical1 = successStep('c1', 'critical');

      const installer = createPriorityInstaller([critical1]);
      await installer.run();

      const allLogs = logSpy.mock.calls.map((c: any) => c[0]) as string[];
      // Start
      expect(allLogs.some((msg) => msg.includes('核心配置') && msg.includes('正在') && msg.includes('Step c1'))).toBe(true);
      // Success
      expect(allLogs.some((msg) => msg.includes('核心配置') && msg.includes('完成') && msg.includes('Step c1'))).toBe(true);
      // Phase summary
      expect(allLogs.some((msg) => msg.includes('核心配置') && msg.includes('1/1 成功'))).toBe(true);
    });

    it('logs step failure with reason', async () => {
      const criticalFail = failStep('c-fail', 'critical', 'config error');
      const secondary1 = successStep('s1', 'secondary');

      const installer = createPriorityInstaller([criticalFail, secondary1]);
      await installer.run();

      const allLogs = logSpy.mock.calls.map((c: any) => c[0]) as string[];
      expect(allLogs.some((msg) => msg.includes('核心配置') && msg.includes('失败') && msg.includes('config error'))).toBe(true);
    });

    it('logs secondary phase with 外部工具 label', async () => {
      const critical1 = successStep('c1', 'critical');
      const secondary1 = successStep('s1', 'secondary');

      const installer = createPriorityInstaller([critical1, secondary1]);
      await installer.run();

      const allLogs = logSpy.mock.calls.map((c: any) => c[0]) as string[];
      expect(allLogs.some((msg) => msg.includes('外部工具'))).toBe(true);
    });

    it('logs tertiary phase with 可选组件 label', async () => {
      const critical1 = successStep('c1', 'critical');
      const tertiary1 = successStep('t1', 'tertiary');

      const installer = createPriorityInstaller([critical1, tertiary1]);
      await installer.run();

      const allLogs = logSpy.mock.calls.map((c: any) => c[0]) as string[];
      expect(allLogs.some((msg) => msg.includes('可选组件'))).toBe(true);
    });
  });

  describe('InstallationSummary structure', () => {
    it('returns correct summary for mixed phases', async () => {
      const c1 = successStep('c1', 'critical');
      const s1 = successStep('s1', 'secondary');
      const s2 = failStep('s2', 'secondary', 'err');
      const t1 = successStep('t1', 'tertiary');
      const t2 = failStep('t2', 'tertiary', 'optional');

      const installer = createPriorityInstaller([c1, s1, s2, t1, t2]);
      const result = await installer.run();

      expect(result).toHaveProperty('phases');
      expect(result).toHaveProperty('overallSuccess');
      expect(result.phases).toHaveProperty('critical');
      expect(result.phases).toHaveProperty('secondary');
      expect(result.phases).toHaveProperty('tertiary');
      expect(result.phases.critical).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(result.phases.secondary).toEqual({ total: 2, succeeded: 1, failed: 1 });
      expect(result.phases.tertiary).toEqual({ total: 2, succeeded: 1, failed: 1 });
      // Tertiary failures don't affect overallSuccess
      expect(result.overallSuccess).toBe(false); // secondary failed
    });
  });

  describe('empty steps', () => {
    it('handles empty steps list with overallSuccess=true', async () => {
      const installer = createPriorityInstaller([]);
      const result = await installer.run();

      expect(result.overallSuccess).toBe(true);
      expect(result.phases.critical).toEqual({ total: 0, succeeded: 0, failed: 0 });
      expect(result.phases.secondary).toEqual({ total: 0, succeeded: 0, failed: 0 });
      expect(result.phases.tertiary).toEqual({ total: 0, succeeded: 0, failed: 0 });
    });
  });

  describe('createDefaultInstaller', () => {
    it('returns non-null', () => {
      const installer = createDefaultInstaller(getDefaultContext());
      expect(installer).not.toBeNull();
    });

    it('returns an installer with a run() method', () => {
      const installer = createDefaultInstaller(getDefaultContext());
      expect(installer).not.toBeNull();
      expect(typeof installer!.run).toBe('function');
    });

    it('has correct step IDs', () => {
      const installer = createDefaultInstaller(getDefaultContext());
      expect(installer).not.toBeNull();
      const stepIds = installer!.steps.map((s) => s.id);
      expect(stepIds).toEqual([
        'create-config-dir',
        'init-config-file',
        'configure-llm',
        'scan-cli-tools',
        'load-templates',
      ]);
    });

    it('has correct step priorities', () => {
      const installer = createDefaultInstaller(getDefaultContext());
      expect(installer).not.toBeNull();
      const criticalIds = installer!.steps
        .filter((s) => s.priority === 'critical')
        .map((s) => s.id);
      const secondaryIds = installer!.steps
        .filter((s) => s.priority === 'secondary')
        .map((s) => s.id);
      const tertiaryIds = installer!.steps
        .filter((s) => s.priority === 'tertiary')
        .map((s) => s.id);

      expect(criticalIds).toEqual(['create-config-dir', 'init-config-file', 'configure-llm']);
      expect(secondaryIds).toEqual(['scan-cli-tools']);
      expect(tertiaryIds).toEqual(['load-templates']);
    });

    it('configure-llm step is retryable', () => {
      const installer = createDefaultInstaller(getDefaultContext());
      expect(installer).not.toBeNull();
      const llmStep = installer!.steps.find((s) => s.id === 'configure-llm');
      expect(llmStep).toBeDefined();
      expect(llmStep!.retryable).toBe(true);
    });
  });
});
