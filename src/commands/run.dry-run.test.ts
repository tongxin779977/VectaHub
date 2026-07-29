import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const installerRun = vi.fn(async () => ({
  phases: {
    critical: { total: 0, succeeded: 0, failed: 0 },
    secondary: { total: 0, succeeded: 0, failed: 0 },
    tertiary: { total: 0, succeeded: 0, failed: 0 },
  },
  overallSuccess: true,
}));
const createWorkflow = vi.fn();
const executeWorkflow = vi.fn();
const loadWorkflowFromFile = vi.fn();
const orchestrateIntent = vi.fn(async () => ({
  steps: [
    {
      id: 'step_1',
      description: 'Git status',
      status: 'PENDING',
      cli: 'git',
      args: ['status'],
      type: 'exec',
    },
  ],
  plan: {
    id: 'plan_dry',
    label: 'Git status plan',
    capabilityId: 'git-workflow',
    goal: { action: 'analyze', scope: 'project' },
    steps: [
      {
        id: 'step_1',
        label: 'Git status',
        type: 'command',
        command: { cli: 'git', args: ['status'] },
      },
    ],
    userReport: {
      summaryTemplate: 'Dry run: git status',
      nextActions: ['Check output'],
      verificationSteps: ['Verify git status output'],
    },
  },
  intentRecognitionMethod: 'capability',
  matchedCapability: 'git-workflow',
  score: 0.9,
}));
type ResolveRunTaskContractFn = typeof import('./run-task-contract-resolver.js')['resolveRunTaskContract'];
const resolveRunTaskContractMock = vi.fn();
let actualResolveRunTaskContract: ResolveRunTaskContractFn;

vi.mock('../utils/logger.js', () => ({
  createConsoleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  isLoggerMuted: vi.fn(() => false),
  setMuted: vi.fn(),
}));

vi.mock('../setup/first-run-wizard.js', () => ({
  isFirstRun: vi.fn(() => true),
  loadConfig: vi.fn(() => ({
    first_run_completed: false,
    ai_providers: { vectahub_llm: { provider: '', enabled: false } },
  })),
  saveConfig: vi.fn(),
}));

vi.mock('../setup/priority-installer.js', () => ({
  createDefaultInstaller: vi.fn(() => ({ run: installerRun })),
}));

vi.mock('../workflow/storage.js', () => ({
  createStorage: vi.fn(() => ({
    loadWorkflowFromFile,
    saveWorkflow: vi.fn(),
  })),
}));

vi.mock('../workflow/engine.js', () => ({
  createWorkflowEngine: vi.fn(() => ({
    loadWorkflows: vi.fn(),
    createWorkflow,
    execute: executeWorkflow,
  })),
}));

vi.mock('../execution/record-manager.js', () => ({
  createRecordManager: vi.fn(() => ({ save: vi.fn() })),
}));

vi.mock('../skills/init.js', () => ({
  createSkillSystem: vi.fn(async () => ({ registry: {}, executor: {} })),
}));

vi.mock('../nl/orchestrator.js', () => ({
  orchestrateIntent,
}));

vi.mock('./run-task-contract-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./run-task-contract-resolver.js')>();
  actualResolveRunTaskContract = actual.resolveRunTaskContract;
  resolveRunTaskContractMock.mockImplementation(actual.resolveRunTaskContract);
  return {
    ...actual,
    resolveRunTaskContract: resolveRunTaskContractMock,
  };
});

vi.mock('../nl/templates/index.js', () => ({
  INTENT_TEMPLATES: [],
}));

async function createTestRunCmd() {
  const { createRunCmd } = await import('./run.js');
  const { getDefaultContext } = await import('../infrastructure/context.js');
  return createRunCmd(getDefaultContext());
}

function resetResolveRunTaskContractMock(): void {
  resolveRunTaskContractMock.mockReset();
  resolveRunTaskContractMock.mockImplementation(actualResolveRunTaskContract);
}

describe('run command dry-run first run behavior', () => {
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    installerRun.mockClear();
    createWorkflow.mockClear();
    executeWorkflow.mockClear();
    orchestrateIntent.mockClear();
    resetResolveRunTaskContractMock();
    orchestrateIntent.mockResolvedValue({
      steps: [
        {
          id: 'step_1',
          description: 'Git status',
          status: 'PENDING',
          cli: 'git',
          args: ['status'],
          type: 'exec',
        },
      ],
      plan: {
        id: 'plan_dry',
        label: 'Git status plan',
        capabilityId: 'git-workflow',
        goal: { action: 'analyze', scope: 'project' },
        steps: [
          {
            id: 'step_1',
            label: 'Git status',
            type: 'command',
            command: { cli: 'git', args: ['status'] },
          },
        ],
        userReport: {
          summaryTemplate: 'Dry run: git status',
          nextActions: ['Check output'],
          verificationSteps: ['Verify git status output'],
        },
      },
      intentRecognitionMethod: 'capability',
      matchedCapability: 'git-workflow',
      score: 0.9,
    });
    loadWorkflowFromFile.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('skips first-run installer and execution in dry-run mode', async () => {
    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '--dry-run', '查看 git 状态']);

    expect(installerRun).not.toHaveBeenCalled();
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('skips workflow execution when dry-running a workflow file', async () => {
    loadWorkflowFromFile.mockResolvedValue({
      id: 'wf_1',
      name: 'dry file workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }],
      createdAt: new Date(),
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '--dry-run', '--file', 'workflow.yaml']);

    expect(loadWorkflowFromFile).toHaveBeenCalled();
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('creates an ephemeral workflow by default for natural language execution', async () => {
    createWorkflow.mockResolvedValue({
      id: 'wf_ephemeral',
      name: 'ephemeral workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }],
      createdAt: new Date(),
    });
    executeWorkflow.mockResolvedValue({
      executionId: 'exec_1',
      workflowId: 'wf_ephemeral',
      workflowName: 'ephemeral workflow',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date(),
      endedAt: new Date(),
      duration: 1,
      steps: [],
      warnings: [],
      logs: [],
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '查看 git 状态']);

    expect(createWorkflow).toHaveBeenCalledWith(
      expect.stringMatching(/^intent_/),
      expect.any(Array),
      { persist: false }
    );
  });

  it('persists workflow only when save flag is provided', async () => {
    createWorkflow.mockResolvedValue({
      id: 'wf_saved',
      name: 'saved workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }],
      createdAt: new Date(),
    });
    executeWorkflow.mockResolvedValue({
      executionId: 'exec_2',
      workflowId: 'wf_saved',
      workflowName: 'saved workflow',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date(),
      endedAt: new Date(),
      duration: 1,
      steps: [],
      warnings: [],
      logs: [],
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '--save', '查看 git 状态']);

    expect(createWorkflow).toHaveBeenCalledWith(
      expect.stringMatching(/^intent_/),
      expect.any(Array),
      { persist: true }
    );
  });

  it('does not create a workflow for document task edit dispatch', async () => {
    orchestrateIntent.mockResolvedValue({
      steps: [
        {
          id: 'step_ci_diagnose',
          description: 'CI diagnose',
          status: 'PENDING',
          cli: 'vectahub',
          args: ['ci', 'diagnose'],
          type: 'exec',
        },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'ci_diagnose',
      score: 0.8,
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '在 docs/tasks/run-task-kernel-hardening.md 追加 Task RTK-006D']);

    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('blocks generated VectaHub commands that are not registered', async () => {
    orchestrateIntent.mockResolvedValue({
      steps: [
        {
          id: 'step_ci_diagnose',
          description: 'CI diagnose',
          status: 'PENDING',
          cli: 'vectahub',
          args: ['ci', 'diagnose'],
          type: 'exec',
        },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'ci_diagnose',
      score: 0.8,
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '诊断 CI 失败']);

    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('outputs blocked envelope in dry-run --json for unregistered VectaHub command', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        {
          id: 'step_blocked',
          description: 'Blocked command',
          status: 'PENDING',
          cli: 'vectahub',
          args: ['ci', 'diagnose'],
          type: 'exec',
        },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'ci_diagnose',
      score: 0.8,
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '诊断 CI 失败']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('blocked');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('outputs clarify envelope in dry-run --json for doc-task-edit dispatch', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        {
          id: 'step_doc',
          description: 'Doc task',
          status: 'PENDING',
          cli: 'vectahub',
          args: ['run-task'],
          type: 'exec',
        },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'doc_task',
      score: 0.8,
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '在 docs/tasks/run-task-kernel-hardening.md 追加 Task RTK-006D']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('clarify');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('outputs workflow_draft envelope in dry-run --json for executable steps', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        {
          id: 'step_1',
          description: 'Git status',
          status: 'PENDING',
          cli: 'git',
          args: ['status'],
          type: 'exec',
        },
      ],
      plan: {
        id: 'plan_dry',
        label: 'Git status plan',
        capabilityId: 'git-workflow',
        goal: { action: 'analyze', scope: 'project' },
        steps: [
          {
            id: 'step_1',
            label: 'Git status',
            type: 'command',
            command: { cli: 'git', args: ['status'] },
          },
        ],
        userReport: {
          summaryTemplate: 'Dry run: git status',
          nextActions: ['Check output'],
          verificationSteps: ['Verify git status output'],
        },
      },
      intentRecognitionMethod: 'capability',
      matchedCapability: 'git-workflow',
      score: 0.9,
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', 'git status']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('plan');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('applies --variable interpolation in dry-run --json for file workflow', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    loadWorkflowFromFile.mockResolvedValue({
      id: 'wf_var',
      name: 'git commit workflow',
      steps: [
        { id: 'step_1', type: 'exec', cli: 'git', args: ['add', '${files}'] },
        { id: 'step_2', type: 'exec', cli: 'git', args: ['commit', '-m', '${message}'] },
      ],
      createdAt: new Date(),
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync([
      'node', 'test', '--dry-run', '--json',
      '--file', 'git-commit.yaml',
      '--variable', 'files=.',
      '--variable', 'message=test commit',
    ]);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('workflow_draft');
    const steps = parsed.result.workflow.steps;
    expect(steps[0].command.args).toContain('.');
    expect(steps[1].command.args).toContain('test commit');
    expect(steps[0].command.args).not.toContain('${files}');
    expect(steps[1].command.args).not.toContain('${message}');
    consoleSpy.mockRestore();
  });

  it('includes mode in dry-run --json output for file workflow', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    loadWorkflowFromFile.mockResolvedValue({
      id: 'wf_mode',
      name: 'test workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }],
      createdAt: new Date(),
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync([
      'node', 'test', '--dry-run', '--json',
      '--file', 'test.yaml',
      '--mode', 'strict',
    ]);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.mode).toBe('strict');
    consoleSpy.mockRestore();
  });

  it('defaults to relaxed mode in dry-run --json when no mode specified', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    loadWorkflowFromFile.mockResolvedValue({
      id: 'wf_default',
      name: 'test workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }],
      createdAt: new Date(),
    });

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync([
      'node', 'test', '--dry-run', '--json',
      '--file', 'test.yaml',
    ]);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.mode).toBe('relaxed');
    consoleSpy.mockRestore();
  });

  it('includes consensus mode in dry-run --json for NL intent', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const runCmd = await createTestRunCmd();

    await runCmd.parseAsync([
      'node', 'test', '--dry-run', '--json',
      '--mode', 'consensus',
      'git status',
    ]);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.mode).toBe('consensus');
    consoleSpy.mockRestore();
  });
});

describe('run command TaskContract-first routing', () => {
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    orchestrateIntent.mockClear();
    resetResolveRunTaskContractMock();
    createWorkflow.mockClear();
    executeWorkflow.mockClear();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('outputs reply envelope in dry-run --json for reply-only input', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [],
      reply: '项目状态正常。',
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'QUERY_INFO',
      score: 0.9,
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '当前项目怎么样']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('reply');
    expect(parsed.result.reply).toBe('项目状态正常。');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('outputs blocked envelope in dry-run --json when no steps and no reply', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [],
      intentRecognitionMethod: 'none',
      score: 0,
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '模糊请求']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('blocked');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('outputs blocked envelope in dry-run --json for invalid vectahub command', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        { id: 'step_1', description: 'Doctor', status: 'PENDING', cli: 'vectahub', args: ['doctor'], type: 'exec' },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'doctor',
      score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'invalid-vh', rawInput: '诊断 CI 失败', normalizedGoal: '诊断 CI 失败',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['ci_diagnose'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'inspect', operation: 'ci_diagnose',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'direct-command', commandSurfaceId: 'vectahub ci diagnose' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'ci_diagnose', confidence: 0.9, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '诊断 CI 失败']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('blocked');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not output Intent: or step_ in dry-run --json for reply', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [],
      reply: '项目状态正常。',
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'QUERY_INFO',
      score: 0.9,
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '当前项目怎么样']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('项目状态正常。');
    expect(output).not.toContain('Intent:');
    expect(output).not.toContain('step_');
    consoleSpy.mockRestore();
  });

  it('execute contract takes precedence over legacy reply in dry-run --json', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        { id: 'step_1', description: 'Git status', status: 'PENDING', cli: 'git', args: ['status'], type: 'exec' },
      ],
      reply: '我先解释一下',
      plan: {
        id: 'plan_exec',
        label: 'Git status plan',
        capabilityId: 'git-workflow',
        goal: { action: 'analyze', scope: 'project' },
        steps: [{ id: 'step_1', label: 'Git status', type: 'command', command: { cli: 'git', args: ['status'] } }],
        userReport: { summaryTemplate: 'Dry run: git status', nextActions: [], verificationSteps: [] },
      },
      intentRecognitionMethod: 'capability',
      matchedCapability: 'git-workflow',
      score: 0.9,
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '查看 git 状态并解释']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('plan');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('execute contract with reply does not return reply early in non-dry-run', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        { id: 'step_1', description: 'Git status', status: 'PENDING', cli: 'git', args: ['status'], type: 'exec' },
      ],
      reply: '我先解释一下',
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'git_status',
      score: 0.9,
    });
    // Mock ReplyTaskContract so the code takes the reply-present path (early return)
    // instead of falling through to workflow creation.
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'reply-non-dry', rawInput: '查看 git 状态并解释', normalizedGoal: '查看 git 状态并解释',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['git_status'], routeSource: 'capability' },
        kind: 'reply', replyMode: 'answer', answerTopic: 'git_status',
      },
      legacy: { success: true, intent: 'git_status', confidence: 0.9, reply: '我先解释一下', metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '查看 git 状态并解释']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    expect(output).not.toContain('我先解释一下');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('doc-task-edit still blocks before TaskContract routing', async () => {
    orchestrateIntent.mockResolvedValue({
      steps: [
        { id: 'step_doc', description: 'Doc task', status: 'PENDING', cli: 'vectahub', args: ['run-task'], type: 'exec' },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'doc_task',
      score: 0.8,
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '在 docs/tasks/run-task-kernel-hardening.md 追加 Task RTK-006D']);

    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('doctor intent resolves to agent-runtime instead of executing legacy doctor steps in dry-run', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [
        { id: 'step_1', description: 'Doctor', status: 'PENDING', cli: 'vectahub', args: ['doctor'], type: 'exec' },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'doctor',
      score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'doctor-dry-run', rawInput: '诊断项目', normalizedGoal: '诊断项目',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['doctor'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'diagnose', operation: 'doctor',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'agent-runtime' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'doctor', confidence: 0.9, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '诊断项目']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('blocked');
    expect(parsed.dispatch.kind).toBe('agent-task');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('doctor intent auto-generates an agent task contract instead of executing legacy doctor steps', async () => {
    const { getDefaultContext } = await import('../infrastructure/context.js');
    const env = getDefaultContext().environment;
    const ensureDirSpy = vi.spyOn(env, 'ensureDir').mockImplementation(() => {});
    const writeFileSpy = vi.spyOn(env, 'writeFile').mockImplementation(() => {});

    orchestrateIntent.mockResolvedValue({
      steps: [
        { id: 'step_1', description: 'Doctor', status: 'PENDING', cli: 'vectahub', args: ['doctor'], type: 'exec' },
      ],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'doctor',
      score: 0.9,
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '诊断项目']);

    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(ensureDirSpy).toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('.md'),
      expect.stringContaining('taskId:')
    );

    ensureDirSpy.mockRestore();
    writeFileSpy.mockRestore();
  });
});

describe('run command TaskContract priority over legacy', () => {
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    orchestrateIntent.mockClear();
    createWorkflow.mockClear();
    executeWorkflow.mockClear();
    resetResolveRunTaskContractMock();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('reply contract blocks even when legacy has steps (dry-run --json)', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Git status', status: 'PENDING', cli: 'git', args: ['status'], type: 'exec' }],
      reply: '项目状态正常。',
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'QUERY_INFO',
      score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'r1', rawInput: '当前项目怎么样', normalizedGoal: '当前项目怎么样',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['QUERY_INFO'], routeSource: 'mixed' },
        kind: 'reply', replyMode: 'answer', answerTopic: 'general',
      },
      legacy: { success: true, intent: 'QUERY_INFO', confidence: 0.9, reply: '项目状态正常。', metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '当前项目怎么样']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('reply');
    expect(parsed.result.reply).toBe('项目状态正常。');
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('clarify contract blocks even when legacy has steps (dry-run --json)', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Some step', status: 'PENDING', cli: 'git', args: ['status'], type: 'exec' }],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'UNKNOWN',
      score: 0.3,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'c1', rawInput: '帮我处理', normalizedGoal: '帮我处理',
        confidence: 0.3, language: 'zh-CN', internalSignals: { intentCandidates: ['UNKNOWN'], routeSource: 'mixed' },
        kind: 'clarify', missing: [], question: '请说明具体目标',
      },
      legacy: { success: true, intent: 'UNKNOWN', confidence: 0.3, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '帮我处理']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('clarify');
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('blocked contract blocks even when legacy has steps (dry-run --json)', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Some step', status: 'PENDING', cli: 'git', args: ['status'], type: 'exec' }],
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'UNKNOWN',
      score: 0.1,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'b1', rawInput: 'xyzzy', normalizedGoal: 'xyzzy',
        confidence: 0.1, language: 'unknown', internalSignals: { intentCandidates: ['UNKNOWN'], routeSource: 'mixed' },
        kind: 'blocked', reason: 'request is blocked', safetyCategory: 'unsupported',
      },
      legacy: { success: true, intent: 'UNKNOWN', confidence: 0.1, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', 'xyzzy']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('blocked');
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('execute contract does not return reply early even with legacy reply', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Git status', status: 'PENDING', cli: 'git', args: ['status'], type: 'exec' }],
      reply: '我先解释一下',
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'git_status',
      score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'e1', rawInput: '查看 git 状态并解释', normalizedGoal: '查看 git 状态并解释',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['git_status'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'modify', operation: 'git_status',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'direct-command', commandSurfaceId: 'git status' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'git_status', confidence: 0.9, reply: '我先解释一下', metadata: { path: 'rule-based' } },
    });
    createWorkflow.mockResolvedValue({
      id: 'wf_exec', name: 'exec workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }], createdAt: new Date(),
    });
    executeWorkflow.mockResolvedValue({
      executionId: 'exec_1', workflowId: 'wf_exec', workflowName: 'exec workflow',
      status: 'COMPLETED', mode: 'relaxed', startedAt: new Date(), endedAt: new Date(),
      duration: 1, steps: [], warnings: [], logs: [],
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '查看 git 状态并解释']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    expect(output).not.toContain('我先解释一下');
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('execute-bridge uses contract command not legacy steps (dry-run --json)', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_legacy', description: 'Legacy', status: 'PENDING', cli: 'git', args: ['log'], type: 'exec' }],
      intentRecognitionMethod: 'capability', recognizedIntent: 'doctor', score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'eb1', rawInput: '诊断项目', normalizedGoal: '诊断项目',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['doctor'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'diagnose', operation: 'doctor',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'capability', commandSurfaceId: 'vectahub doctor' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'doctor', confidence: 0.9, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '诊断项目']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('workflow_draft');
    const steps = parsed.result.workflow.steps;
    expect(steps[0].command.cli).toBe('vectahub');
    expect(steps[0].command.args).toContain('doctor');
    expect(createWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('execute-bridge uses contract command not legacy steps (non-dry-run)', async () => {
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_legacy', description: 'Legacy', status: 'PENDING', cli: 'git', args: ['log'], type: 'exec' }],
      intentRecognitionMethod: 'capability', recognizedIntent: 'doctor', score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'eb2', rawInput: '诊断项目', normalizedGoal: '诊断项目',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['doctor'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'diagnose', operation: 'doctor',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'capability', commandSurfaceId: 'vectahub doctor' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'doctor', confidence: 0.9, metadata: { path: 'rule-based' } },
    });
    createWorkflow.mockResolvedValue({
      id: 'wf_bridge', name: 'bridge workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'vectahub', args: ['doctor'] }], createdAt: new Date(),
    });
    executeWorkflow.mockResolvedValue({
      executionId: 'exec_bridge', workflowId: 'wf_bridge', workflowName: 'bridge workflow',
      status: 'COMPLETED', mode: 'relaxed', startedAt: new Date(), endedAt: new Date(),
      duration: 1, steps: [], warnings: [], logs: [],
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '诊断项目']);

    expect(createWorkflow).toHaveBeenCalledWith(
      expect.stringMatching(/^intent_/),
      expect.arrayContaining([expect.objectContaining({ cli: 'vectahub', args: ['doctor'] })]),
      { persist: false }
    );
    expect(executeWorkflow).toHaveBeenCalled();
  });

  it('agent-runtime contract is blocked and does not create workflow (dry-run --json)', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Refactor', status: 'PENDING', cli: 'vectahub', args: ['run-task'], type: 'exec' }],
      intentRecognitionMethod: 'capability', recognizedIntent: 'refactor', score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'ar1', rawInput: '重构模块', normalizedGoal: '重构模块',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['refactor'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'delegate', operation: 'refactor',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'agent-runtime' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'refactor', confidence: 0.9, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '重构模块']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.kind).toBe('blocked');
    expect(parsed.result.reason).toContain('Agent runtime');
    expect(parsed.dispatch.kind).toBe('agent-task');
    expect(parsed.dispatch.reason).toContain('agent-runtime');
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('default UI does not output Intent: or step_', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    orchestrateIntent.mockResolvedValue({
      steps: [],
      reply: '项目状态正常。',
      intentRecognitionMethod: 'capability',
      recognizedIntent: 'QUERY_INFO',
      score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'ui1', rawInput: '当前项目怎么样', normalizedGoal: '当前项目怎么样',
        confidence: 0.9, language: 'zh-CN', internalSignals: { intentCandidates: ['QUERY_INFO'], routeSource: 'mixed' },
        kind: 'reply', replyMode: 'answer', answerTopic: 'general',
      },
      legacy: { success: true, intent: 'QUERY_INFO', confidence: 0.9, reply: '项目状态正常。', metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--dry-run', '--json', '当前项目怎么样']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('项目状态正常。');
    expect(output).not.toContain('Intent:');
    expect(output).not.toContain('step_');
    consoleSpy.mockRestore();
  });

  it('agent-runtime contract auto-generates markdown and updates suggestedAction in non-dry-run --json mode', async () => {
    const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { getDefaultContext } = await import('../infrastructure/context.js');
    const env = getDefaultContext().environment;
    const ensureDirSpy = vi.spyOn(env, 'ensureDir').mockImplementation(() => {});
    const writeFileSpy = vi.spyOn(env, 'writeFile').mockImplementation(() => {});

    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Refactor', status: 'PENDING', cli: 'vectahub', args: ['run-task'], type: 'exec' }],
      intentRecognitionMethod: 'capability', recognizedIntent: 'refactor', score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'ar-test-json-123', rawInput: '重构模块', normalizedGoal: '重构模块',
        confidence: 0.95, language: 'zh-CN', internalSignals: { intentCandidates: ['refactor'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'delegate', operation: 'refactor',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'agent-runtime' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'refactor', confidence: 0.9, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '--json', '重构模块']);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.dispatch.kind).toBe('agent-task');
    expect(parsed.dispatch.suggestedAction).toContain('自动为您生成任务合同');
    expect(parsed.dispatch.suggestedAction).toContain('run-task --file');
    expect(parsed.reason).toContain('自动为您生成任务合同');

    expect(ensureDirSpy).toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('ar-test-json-123.md'),
      expect.stringContaining('taskId: ar-test-json-123')
    );

    ensureDirSpy.mockRestore();
    writeFileSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('agent-runtime contract auto-generates markdown and prints feedback in non-dry-run console mode', async () => {
    const { getDefaultContext } = await import('../infrastructure/context.js');
    const loggerInstance = getDefaultContext().logger.getLogger('run');
    const loggerInfoSpy = vi.spyOn(loggerInstance, 'info').mockImplementation(() => {});
    
    const env = getDefaultContext().environment;
    const ensureDirSpy = vi.spyOn(env, 'ensureDir').mockImplementation(() => {});
    const writeFileSpy = vi.spyOn(env, 'writeFile').mockImplementation(() => {});

    orchestrateIntent.mockResolvedValue({
      steps: [{ id: 'step_1', description: 'Refactor', status: 'PENDING', cli: 'vectahub', args: ['run-task'], type: 'exec' }],
      intentRecognitionMethod: 'capability', recognizedIntent: 'refactor', score: 0.9,
    });
    resolveRunTaskContractMock.mockReturnValue({
      taskContract: {
        schemaVersion: '1.0', requestId: 'ar-test-console-123', rawInput: '重构模块', normalizedGoal: '重构模块',
        confidence: 0.95, language: 'zh-CN', internalSignals: { intentCandidates: ['refactor'], routeSource: 'rule-based' },
        kind: 'execute', taskKind: 'delegate', operation: 'refactor',
        target: { scope: 'project' }, constraints: { requiresConfirmation: false, requiresVerification: false, sideEffects: ['command'] },
        executionStrategy: { mode: 'agent-runtime' },
        expectedOutput: { format: 'text', audience: 'system' },
      },
      legacy: { success: true, intent: 'refactor', confidence: 0.9, metadata: { path: 'rule-based' } },
    });

    const runCmd = await createTestRunCmd();
    await runCmd.parseAsync(['node', 'test', '重构模块']);

    const output = loggerInfoSpy.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('自动为您生成任务合同');
    expect(output).toContain('run-task --file');

    expect(ensureDirSpy).toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('ar-test-console-123.md'),
      expect.stringContaining('taskId: ar-test-console-123')
    );

    ensureDirSpy.mockRestore();
    writeFileSpy.mockRestore();
    loggerInfoSpy.mockRestore();
  });
});
