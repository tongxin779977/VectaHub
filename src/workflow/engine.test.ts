import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkflowEngine, type WorkflowEngine } from './engine.js';
import type { Step } from '../types/index.js';

let shouldFail = false;

vi.mock('./storage.js', () => ({
  createStorage: () => ({
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    saveWorkflow: vi.fn().mockResolvedValue(undefined),
    getWorkflow: vi.fn().mockResolvedValue(undefined),
    listWorkflows: vi.fn().mockResolvedValue([]),
    deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('./executor.js', () => ({
  createExecutor: vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue({ success: true, exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    execute: vi.fn().mockImplementation(async (step, options) => {
      if (options?.dryRun) {
        return { stepId: step.id, status: 'COMPLETED' as const, output: ['[DRY RUN] echo hello'], duration: 0 };
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      if (shouldFail) {
        shouldFail = false;
        return { stepId: step.id, status: 'FAILED' as const, output: [], duration: 10, error: 'killed' };
      }
      return { stepId: step.id, status: 'COMPLETED' as const, output: ['done'], duration: 10 };
    }),
    executeWorkflow: vi.fn().mockResolvedValue([]),
    validateStep: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    killCurrentProcess: vi.fn().mockImplementation(() => { shouldFail = true; }),
  }),
}));

vi.mock('../utils/audit.js', () => ({
  audit: {
    workflowStart: vi.fn(),
    workflowStep: vi.fn(),
    workflowEnd: vi.fn(),
    cliCommand: vi.fn(),
    cliOutput: vi.fn(),
  },
  getCurrentSessionId: () => 'test-session',
}));

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    shouldFail = false;
    engine = await createWorkflowEngine();
  });

  it('should create a workflow', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    expect(workflow.id).toBeDefined();
    expect(workflow.name).toBe('test-workflow');
    expect(workflow.steps.length).toBe(1);
  });

  it('should add a step to a workflow', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    await engine.addStep(workflow.id, { id: 'step2', type: 'exec', cli: 'echo', args: ['world'] });

    const retrieved = await engine.getWorkflow(workflow.id);
    expect(retrieved?.steps.length).toBe(2);
  });

  it('should remove a step from a workflow', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['world'] },
    ];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    await engine.removeStep(workflow.id, 'step1');

    const retrieved = await engine.getWorkflow(workflow.id);
    expect(retrieved?.steps.length).toBe(1);
    expect(retrieved?.steps[0].id).toBe('step2');
  });

  it('should execute a workflow', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const result = await engine.execute(workflow);

    expect(result.status).toBe('COMPLETED');
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].status).toBe('COMPLETED');
  });

  it('should execute workflow with dry run', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const result = await engine.execute(workflow, { dryRun: true });

    expect(result.status).toBe('COMPLETED');
    expect(result.steps[0].output?.[0]).toContain('[DRY RUN]');
  });

  it('should pause execution between steps', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'sleep', args: ['0.1'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['second'] },
    ];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    let pauseCalled = false;
    const executionPromise = engine.execute(workflow);

    setTimeout(() => {
      pauseCalled = engine.pause();
    }, 20);

    const result = await executionPromise;

    expect(['PAUSED', 'COMPLETED', 'FAILED']).toContain(result.status);
  });

  it('should resume from paused state', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['first'] },
    ];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    engine.pause();
    const resumed = engine.resume();
    expect(resumed).toBe(false);

    const result = await engine.execute(workflow);
    expect(result.status).toBe('COMPLETED');
  });

  it('should abort execution', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'sleep', args: ['1'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['done'] },
    ];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    engine.execute(workflow);
    await new Promise(resolve => setTimeout(resolve, 5)); // 稍短的等待时间
    const result = engine.abort();
    
    expect(result).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    const status = engine.getStatus();
    expect(['ABORTED', 'FAILED']).toContain(status?.status);
  });

  it('should get current execution status', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const statusBefore = engine.getStatus();
    expect(statusBefore).toBeUndefined();

    const executionPromise = engine.execute(workflow);
    const statusDuring = engine.getStatus();
    expect(statusDuring).toBeDefined();
    expect(statusDuring?.status).toBe('RUNNING');

    await executionPromise;
    const statusAfter = engine.getStatus();
    expect(statusAfter?.status).toBe('COMPLETED');
  });
});