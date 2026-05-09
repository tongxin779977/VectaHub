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

vi.mock('../nl/core/index.js', () => ({
  adaptAllTemplates: vi.fn(() => []),
  createNLProcessor: vi.fn(() => ({
    parse: vi.fn(async () => ({
      success: true,
      intent: 'GIT_WORKFLOW',
      taskList: {
        intent: 'GIT_WORKFLOW',
        tasks: [
          {
            commands: [{ cli: 'git', args: ['status'] }],
          },
        ],
      },
    })),
  })),
}));

vi.mock('../nl/core/keyword-fallback.js', () => ({
  createKeywordFallback: vi.fn(() => ({})),
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
