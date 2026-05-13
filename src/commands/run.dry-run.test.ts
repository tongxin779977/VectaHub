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

vi.mock('../nl/llm.js', () => ({
  createLLMConfig: vi.fn(() => null),
}));

vi.mock('../skills/init.js', () => ({
  createSkillSystem: vi.fn(async () => ({ registry: {}, executor: {} })),
}));

vi.mock('../nl/orchestrator.js', () => ({
  orchestrateIntent: vi.fn(async () => ({
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
  })),
}));

vi.mock('../nl/templates/index.js', () => ({
  INTENT_TEMPLATES: [],
}));

describe('run command dry-run first run behavior', () => {
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    installerRun.mockClear();
    createWorkflow.mockClear();
    executeWorkflow.mockClear();
    loadWorkflowFromFile.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('skips first-run installer and execution in dry-run mode', async () => {
    const { runCmd } = await import('./run.js');

    await runCmd.parseAsync(['node', 'test', '--dry-run', '查看 git 状态']);

    expect(installerRun).not.toHaveBeenCalled();
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('skips workflow execution when dry-running a workflow file', async () => {
    loadWorkflowFromFile.mockResolvedValue({
      id: 'wf_1',
      name: 'dry file workflow',
      steps: [{ id: 'step_1', type: 'exec', cli: 'git', args: ['status'] }],
      createdAt: new Date(),
    });

    const { runCmd } = await import('./run.js');

    await runCmd.parseAsync(['node', 'test', '--dry-run', '--file', 'workflow.yaml']);

    expect(loadWorkflowFromFile).toHaveBeenCalled();
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
