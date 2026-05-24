import { beforeEach, describe, it, expect, vi } from 'vitest';

const routeMock = vi.fn();
const parseMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock('./capabilities/router.js', () => ({
  createCapabilityRouter: () => ({
    route: routeMock,
  }),
}));

vi.mock('./core/pipeline.js', () => ({
  createNLProcessor: () => ({
    parse: parseMock,
  }),
}));

vi.mock('./llm.js', async () => {
  const actual = await vi.importActual<typeof import('./llm.js')>('./llm.js');
  return {
    ...actual,
    createLLMConfig: vi.fn(() => ({
      provider: 'openai',
      model: 'mock-model',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'mock',
    })),
  };
});

import { orchestrateIntent, processInput } from './orchestrator.js';

describe('orchestrateIntent', () => {
  beforeEach(() => {
    routeMock.mockReset();
    parseMock.mockReset();
  });

  it('auto route returns capability plan and executable steps', async () => {
    routeMock.mockReturnValueOnce({
      route: 'auto',
      matchedCapability: 'mock-cap',
      score: 0.91,
      reason: 'matched',
      plan: {
        id: 'plan_auto',
        label: 'auto plan',
        capabilityId: 'mock-cap',
        goal: { confidence: 0.91, domains: [], action: 'run', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
        steps: [{
          id: 'cmd_1',
          label: 'run',
          type: 'command',
          command: { cli: 'git', args: ['status'] },
          outputVar: 'gitStatus',
        }],
        userReport: { summaryTemplate: 'ok' },
      },
    });

    const result = await orchestrateIntent('check status', { cwd: process.cwd() });
    expect(result.intentRecognitionMethod).toBe('capability');
    expect(result.plan?.id).toBe('plan_auto');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].cli).toBe('git');
    expect(result.steps[0].args).toEqual(['status']);
    expect(result.steps[0].outputVar).toBe('gitStatus');
  });

  it('preview route keeps plan but returns no executable steps', async () => {
    routeMock.mockReturnValueOnce({
      route: 'preview',
      matchedCapability: 'mock-preview',
      score: 0.62,
      reason: 'preview only',
      plan: {
        id: 'plan_preview',
        label: 'preview plan',
        capabilityId: 'mock-preview',
        goal: { confidence: 0.62, domains: [], action: 'run', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
        steps: [{
          id: 'cmd_1',
          label: 'run',
          type: 'command',
          command: { cli: 'npm', args: ['run', 'test'] },
        }],
        userReport: { summaryTemplate: 'preview' },
      },
    });

    const result = await orchestrateIntent('run tests', { cwd: process.cwd() });
    expect(result.intentRecognitionMethod).toBe('capability');
    expect(result.plan?.id).toBe('plan_preview');
    expect(result.steps).toHaveLength(0);
  });

  it('clarify route does not fall back to executable LLM steps', async () => {
    routeMock.mockReturnValueOnce({
      route: 'clarify',
      matchedCapability: 'mock-clarify',
      score: 0.55,
      reason: 'need clarification',
      plan: null,
    });

    const result = await orchestrateIntent('do something ambiguous', { cwd: process.cwd() });
    expect(result.intentRecognitionMethod).toBe('none');
    expect(result.steps).toHaveLength(0);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('processInput uses capability-first and does not require llmConfig for auto route', async () => {
    routeMock.mockReturnValueOnce({
      route: 'auto',
      matchedCapability: 'mock-cap',
      score: 0.9,
      reason: 'matched',
      plan: {
        id: 'plan_input_auto',
        label: 'auto plan',
        capabilityId: 'mock-cap',
        goal: { confidence: 0.9, domains: [], action: 'run', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
        steps: [{
          id: 'cmd_1',
          label: 'run',
          type: 'command',
          command: { cli: 'git', args: ['status'] },
          outputVar: 'gitStatus',
        }],
        userReport: { summaryTemplate: 'ok' },
      },
    });

    const result = await processInput('check status');
    expect(result.success).toBe(true);
    expect(result.taskList?.tasks.length).toBeGreaterThan(0);
    const commands = result.taskList?.tasks[0]?.commands ?? [];
    expect(commands[0]?.outputVar).toBe('gitStatus');
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('processInput uses capability-first and does not require llmConfig for clarify route', async () => {
    routeMock.mockReturnValueOnce({
      route: 'clarify',
      matchedCapability: 'mock-clarify',
      score: 0.4,
      reason: 'need clarification',
      plan: null,
    });

    const result = await processInput('do something ambiguous');
    expect(result.success).toBe(true);
    expect(result.taskList?.tasks).toHaveLength(0);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('processInput requires llmConfig only when entering fallback', async () => {
    routeMock.mockReturnValueOnce({
      route: 'fallback',
      matchedCapability: undefined,
      score: 0.1,
      reason: 'no capability',
      plan: null,
    });

    await expect(processInput('unknown intent')).rejects.toThrow(
      'LLM config required for fallback processing'
    );
  });

  it('processInput requires audit helper when entering fallback', async () => {
    routeMock.mockReturnValueOnce({
      route: 'fallback',
      matchedCapability: undefined,
      score: 0.1,
      reason: 'no capability',
      plan: null,
    });

    await expect(processInput('unknown intent', {
      provider: 'openai',
      model: 'mock-model',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'mock',
    })).rejects.toThrow(
      'Audit helper required for fallback processing'
    );
  });

  it('processInput capability plan preserves outputVar/runId binding chain', async () => {
    routeMock.mockReturnValueOnce({
      route: 'auto',
      matchedCapability: 'github-actions-repair',
      score: 0.93,
      reason: 'matched',
      plan: {
        id: 'plan_gh_repair',
        label: 'repair actions',
        capabilityId: 'github-actions-repair',
        goal: { confidence: 0.93, domains: ['github-actions'], action: 'repair', scope: 'all', successCriteria: ['ci-green'], constraints: [], evidence: {}, needsClarification: false },
        steps: [
          {
            id: 'discover-run-id',
            label: 'discover',
            type: 'command',
            command: { cli: 'gh', args: ['run', 'list'] },
            outputVar: 'runId',
          },
          {
            id: 'fetch-logs',
            label: 'logs',
            type: 'command',
            command: { cli: 'gh', args: ['run', 'view', '${runId}', '--log-failed'] },
          },
        ],
        userReport: { summaryTemplate: 'ok' },
      },
    });

    const result = await processInput('repair github actions');
    const commands = result.taskList?.tasks[0]?.commands ?? [];
    expect(commands[0]?.outputVar).toBe('runId');
    expect(commands[1]?.args).toContain('${runId}');
  });

  it('fallback route enters LLM pipeline', async () => {
    routeMock
      .mockReturnValueOnce({
        route: 'fallback',
        matchedCapability: undefined,
        score: 0.1,
        reason: 'no capability',
        plan: null,
      })
      .mockReturnValueOnce({
        route: 'fallback',
        matchedCapability: undefined,
        score: 0.1,
        reason: 'no capability',
        plan: null,
      });
    parseMock.mockResolvedValueOnce({
      success: true,
      confidence: 0.88,
      intent: 'RUN_SCRIPT',
      taskList: {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        originalInput: 'fallback route',
        intent: 'RUN_SCRIPT',
        confidence: 0.88,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [{
          id: 't1',
          type: 'QUERY_EXEC',
          description: 'llm step',
          status: 'PENDING',
          commands: [{ cli: 'git', args: ['status'], outputVar: 'gitStatus' }],
          dependencies: [],
        }],
        warnings: [],
      },
      metadata: { path: 'llm-tool-calling', usedSkills: [] },
    });

    const result = await orchestrateIntent('fallback route', {
      cwd: process.cwd(),
      logger: { error: loggerErrorMock },
      auditHelper: {
        log: vi.fn(),
        cliCommand: vi.fn(),
        cliOutput: vi.fn(),
        workflowStart: vi.fn(),
        workflowEnd: vi.fn(),
        workflowStep: vi.fn(),
        securityAlert: vi.fn(),
        securityAction: vi.fn(),
        configChange: vi.fn(),
        intentMatch: vi.fn(),
        executorResult: vi.fn(),
        fileOperation: vi.fn(),
        sandboxDetect: vi.fn(),
      },
    });
    expect(result.intentRecognitionMethod).toBe('llm');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].cli).toBe('git');
    expect(result.steps[0].args).toEqual(['status']);
    expect(result.steps[0].outputVar).toBe('gitStatus');
  });

  it('routes capability plan and returns executable steps', async () => {
    routeMock.mockReturnValueOnce({
      route: 'auto',
      matchedCapability: 'github-actions-repair',
      score: 0.9,
      reason: 'matched',
      plan: {
        id: 'plan_real_like',
        label: 'repair actions',
        capabilityId: 'github-actions-repair',
        goal: { confidence: 0.9, domains: ['github-actions'], action: 'repair', scope: 'all', successCriteria: ['ci-green'], constraints: [], evidence: {}, needsClarification: false },
        steps: [{
          id: 'cmd_1',
          label: 'discover',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'list'] },
        }],
        userReport: { summaryTemplate: 'repair' },
      },
    });
    const result = await orchestrateIntent('修复 git 上所有 actions 错误', { cwd: process.cwd() });

    expect(result.intentRecognitionMethod).toBe('capability');
    expect(result.plan).toBeDefined();
    expect(result.plan?.capabilityId).toBe('github-actions-repair');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every(step => step.cli.trim().length > 0)).toBe(true);
  });

  it('multi-intent does not generate empty cli steps', async () => {
    routeMock
      .mockReturnValueOnce({
        route: 'auto',
        matchedCapability: 'github-actions-repair',
        score: 0.9,
        reason: 'matched',
        plan: {
          id: 'plan_multi_1',
          label: 'first',
          capabilityId: 'github-actions-repair',
          goal: { confidence: 0.9, domains: [], action: 'repair', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
          steps: [{ id: 's1', label: 'a', type: 'command', command: { cli: 'gh', args: ['run', 'list'] } }],
          userReport: { summaryTemplate: 'first' },
        },
      })
      .mockReturnValueOnce({
        route: 'auto',
        matchedCapability: 'git-workflow',
        score: 0.8,
        reason: 'matched',
        plan: {
          id: 'plan_multi_2',
          label: 'second',
          capabilityId: 'git-workflow',
          goal: { confidence: 0.8, domains: [], action: 'git', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
          steps: [{ id: 's2', label: 'b', type: 'command', command: { cli: 'git', args: ['status'] } }],
          userReport: { summaryTemplate: 'second' },
        },
      });

    const result = await orchestrateIntent('修复 git 上所有 actions 错误 然后 提交代码', { cwd: process.cwd() });

    expect(result.steps.length).toBeGreaterThan(1);
    expect(result.steps.every(step => step.cli.trim().length > 0)).toBe(true);
    expect(result.steps.every(step => Array.isArray(step.args))).toBe(true);
    expect(result.plan).toBeUndefined();
    expect(result.intentRecognitionMethod).toBe('none');
  });

  it('multi-intent fails fast when any clause is preview or clarify', async () => {
    routeMock
      .mockReturnValueOnce({
        route: 'auto',
        matchedCapability: 'github-actions-repair',
        score: 0.9,
        reason: 'matched',
        plan: {
          id: 'plan_multi_ok',
          label: 'ok',
          capabilityId: 'github-actions-repair',
          goal: { confidence: 0.9, domains: [], action: 'repair', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
          steps: [{ id: 's1', label: 'a', type: 'command', command: { cli: 'gh', args: ['run', 'list'] } }],
          userReport: { summaryTemplate: 'ok' },
        },
      })
      .mockReturnValueOnce({
        route: 'preview',
        matchedCapability: 'package-script',
        score: 0.62,
        reason: 'preview only',
        plan: {
          id: 'plan_multi_preview',
          label: 'preview',
          capabilityId: 'package-script',
          goal: { confidence: 0.62, domains: [], action: 'run', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
          steps: [{ id: 's2', label: 'b', type: 'command', command: { cli: 'npm', args: ['run', 'test'] } }],
          userReport: { summaryTemplate: 'preview' },
        },
      });

    await expect(
      orchestrateIntent('先修复 CI 然后运行测试', { cwd: process.cwd() })
    ).rejects.toThrow('Multi-intent contains non-executable clause; clarification or preview required');
  });

  it('processInput multi-intent also fails fast when any clause is preview or clarify', async () => {
    routeMock
      .mockReturnValueOnce({
        route: 'auto',
        matchedCapability: 'github-actions-repair',
        score: 0.9,
        reason: 'matched',
        plan: {
          id: 'plan_process_ok',
          label: 'ok',
          capabilityId: 'github-actions-repair',
          goal: { confidence: 0.9, domains: [], action: 'repair', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
          steps: [{ id: 's1', label: 'a', type: 'command', command: { cli: 'gh', args: ['run', 'list'] } }],
          userReport: { summaryTemplate: 'ok' },
        },
      })
      .mockReturnValueOnce({
        route: 'preview',
        matchedCapability: 'package-script',
        score: 0.62,
        reason: 'preview only',
        plan: {
          id: 'plan_process_preview',
          label: 'preview',
          capabilityId: 'package-script',
          goal: { confidence: 0.62, domains: [], action: 'run', scope: 'project', successCriteria: [], constraints: [], evidence: {}, needsClarification: false },
          steps: [{ id: 's2', label: 'b', type: 'command', command: { cli: 'npm', args: ['run', 'test'] } }],
          userReport: { summaryTemplate: 'preview' },
        },
      });

    await expect(
      processInput('先修复 CI 然后运行测试', {
        provider: 'openai',
        model: 'mock-model',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'mock',
      }, {
        log: vi.fn(),
        cliCommand: vi.fn(),
        cliOutput: vi.fn(),
        workflowStart: vi.fn(),
        workflowEnd: vi.fn(),
        workflowStep: vi.fn(),
        securityAlert: vi.fn(),
        securityAction: vi.fn(),
        configChange: vi.fn(),
        intentMatch: vi.fn(),
        executorResult: vi.fn(),
        fileOperation: vi.fn(),
        sandboxDetect: vi.fn(),
      })
    ).rejects.toThrow('Multi-intent contains non-executable clause; clarification or preview required');
  });
});
