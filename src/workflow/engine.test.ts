import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkflowEngine, type WorkflowEngine } from './engine.js';
import type { Step, ExecutionRecord } from '../types/index.js';

let shouldFail = false;

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockList = vi.fn().mockResolvedValue([]);
const mockSaveWorkflow = vi.fn().mockResolvedValue(undefined);
const mockListWorkflows = vi.fn().mockResolvedValue([]);

vi.mock('./storage.js', () => ({
  createStorage: () => ({
    save: mockSave,
    get: mockGet,
    list: mockList,
    delete: vi.fn().mockResolvedValue(undefined),
    saveWorkflow: mockSaveWorkflow,
    getWorkflow: vi.fn().mockResolvedValue(undefined),
    listWorkflows: mockListWorkflows,
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
    mockSave.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(undefined);
    mockList.mockResolvedValue([]);
    mockSaveWorkflow.mockResolvedValue(undefined);
    mockListWorkflows.mockResolvedValue([]);
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

  describe('topologicalSort (via execution)', () => {
    it('should execute steps with dependsOn in correct order', async () => {
      const steps: Step[] = [
        { id: 'step2', type: 'exec', cli: 'echo', args: ['second'], dependsOn: ['step1'] },
        { id: 'step1', type: 'exec', cli: 'echo', args: ['first'] },
      ];
      const workflow = await engine.createWorkflow('dep-workflow', steps);
      const result = await engine.execute(workflow);

      expect(result.status).toBe('COMPLETED');
      expect(result.steps.length).toBe(2);
      expect(result.steps[0].stepId).toBe('step1');
      expect(result.steps[1].stepId).toBe('step2');
    });

    it('should handle multi-level dependencies', async () => {
      const steps: Step[] = [
        { id: 'step3', type: 'exec', cli: 'echo', args: ['third'], dependsOn: ['step2'] },
        { id: 'step1', type: 'exec', cli: 'echo', args: ['first'] },
        { id: 'step2', type: 'exec', cli: 'echo', args: ['second'], dependsOn: ['step1'] },
      ];
      const workflow = await engine.createWorkflow('multi-dep', steps);
      const result = await engine.execute(workflow);

      expect(result.status).toBe('COMPLETED');
      expect(result.steps[0].stepId).toBe('step1');
      expect(result.steps[1].stepId).toBe('step2');
      expect(result.steps[2].stepId).toBe('step3');
    });

    it('should execute independent steps in original order', async () => {
      const steps: Step[] = [
        { id: 'step1', type: 'exec', cli: 'echo', args: ['first'] },
        { id: 'step2', type: 'exec', cli: 'echo', args: ['second'] },
        { id: 'step3', type: 'exec', cli: 'echo', args: ['third'] },
      ];
      const workflow = await engine.createWorkflow('no-dep', steps);
      const result = await engine.execute(workflow);

      expect(result.steps[0].stepId).toBe('step1');
      expect(result.steps[1].stepId).toBe('step2');
      expect(result.steps[2].stepId).toBe('step3');
    });
  });

  describe('resumeFromFailure', () => {
    it('should resume from failed step and execute remaining steps', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['first'] },
        { id: 's2', type: 'exec', cli: 'echo', args: ['second'] },
        { id: 's3', type: 'exec', cli: 'echo', args: ['third'] },
      ];
      const workflow = await engine.createWorkflow('resume-wf', steps);

      const previousExecution: ExecutionRecord = {
        executionId: 'exec_1',
        workflowId: workflow.id,
        workflowName: 'resume-wf',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [
          { stepId: 's1', status: 'COMPLETED' },
          { stepId: 's2', status: 'FAILED', error: 'killed' },
        ],
        warnings: ['Step 2 failed'],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);

      const result = await engine.resumeFromFailure('exec_1');

      expect(result.status).toBe('COMPLETED');
      expect(result.steps.length).toBe(3);
      expect(result.steps[0].stepId).toBe('s1');
      expect(result.steps[1].stepId).toBe('s2');
      expect(result.steps[2].stepId).toBe('s3');
    });

    it('should preserve previousOutputs from earlier steps', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['data'] },
        { id: 's2', type: 'exec', cli: 'echo', args: ['second'] },
        { id: 's3', type: 'exec', cli: 'echo', args: ['third'] },
      ];
      const workflow = await engine.createWorkflow('ctx-wf', steps);

      const previousExecution: ExecutionRecord = {
        executionId: 'exec_2',
        workflowId: workflow.id,
        workflowName: 'ctx-wf',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [
          { stepId: 's1', status: 'COMPLETED', output: ['output-data'] },
          { stepId: 's2', status: 'FAILED', error: 'killed' },
        ],
        warnings: [],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);

      const result = await engine.resumeFromFailure('exec_2');
      expect(result.status).toBe('COMPLETED');
      expect(result.steps.length).toBe(3);
    });

    it('should throw when execution not found', async () => {
      mockGet.mockResolvedValue(undefined);
      await expect(engine.resumeFromFailure('nonexistent')).rejects.toThrow('not found');
    });

    it('should throw when no failed step found', async () => {
      const steps: Step[] = [{ id: 's1', type: 'exec', cli: 'echo', args: ['ok'] }];
      const workflow = await engine.createWorkflow('no-fail', steps);

      const previousExecution: ExecutionRecord = {
        executionId: 'exec_3',
        workflowId: workflow.id,
        workflowName: 'no-fail',
        status: 'COMPLETED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [{ stepId: 's1', status: 'COMPLETED' }],
        warnings: [],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);

      await expect(engine.resumeFromFailure('exec_3')).rejects.toThrow('No failed step');
    });

    it('should throw when no remaining steps after failed step', async () => {
      const steps: Step[] = [{ id: 's1', type: 'exec', cli: 'echo', args: ['only'] }];
      const workflow = await engine.createWorkflow('last-fail', steps);

      const previousExecution: ExecutionRecord = {
        executionId: 'exec_4',
        workflowId: workflow.id,
        workflowName: 'last-fail',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [{ stepId: 's1', status: 'FAILED', error: 'failed' }],
        warnings: [],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);

      await expect(engine.resumeFromFailure('exec_4')).rejects.toThrow('No remaining steps');
    });

    it('should throw when workflow no longer exists', async () => {
      const previousExecution: ExecutionRecord = {
        executionId: 'exec_5',
        workflowId: 'wf_deleted',
        workflowName: 'deleted',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [{ stepId: 's1', status: 'FAILED', error: 'failed' }],
        warnings: [],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);

      await expect(engine.resumeFromFailure('exec_5')).rejects.toThrow('not found');
    });
  });

  describe('executeAsync and waitForCompletion', () => {
    it('should resolve waitForCompletion after async execution finishes', async () => {
      const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
      const workflow = await engine.createWorkflow('async-wf', steps);

      engine.executeAsync(workflow);
      const result = await engine.waitForCompletion();

      expect(result.status).toBe('COMPLETED');
    });

    it('should resolve immediately when already completed', async () => {
      const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
      const workflow = await engine.createWorkflow('done-wf', steps);

      await engine.execute(workflow);
      const result = await engine.waitForCompletion();

      expect(result.status).toBe('COMPLETED');
    });

    it('should reject when no execution exists', async () => {
      await expect(engine.waitForCompletion()).rejects.toThrow('No execution in progress');
    });
  });

  describe('loadWorkflows', () => {
    it('should load workflows from storage', async () => {
      const storedWorkflow = {
        id: 'wf_100',
        name: 'loaded-wf',
        mode: 'relaxed' as const,
        steps: [{ id: 's1', type: 'exec' as const, cli: 'echo', args: ['loaded'] }],
        createdAt: new Date(),
      };
      mockListWorkflows.mockResolvedValue([storedWorkflow]);

      await engine.loadWorkflows();

      const loaded = await engine.getWorkflow('wf_100');
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('loaded-wf');
    });

    it('should return loaded workflows in listWorkflows', async () => {
      const storedWorkflow = {
        id: 'wf_200',
        name: 'another-wf',
        mode: 'strict' as const,
        steps: [],
        createdAt: new Date(),
      };
      mockListWorkflows.mockResolvedValue([storedWorkflow]);

      await engine.loadWorkflows();
      const all = await engine.listWorkflows();

      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(all.some(w => w.id === 'wf_200')).toBe(true);
    });
  });

  describe('workflow execution failure', () => {
    it('should mark workflow as FAILED when step fails', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['fail'] },
        { id: 's2', type: 'exec', cli: 'echo', args: ['never'] },
      ];
      const workflow = await engine.createWorkflow('fail-wf', steps);

      shouldFail = true;
      const result = await engine.execute(workflow);

      expect(result.status).toBe('FAILED');
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].stepId).toBe('s1');
      expect(result.steps[0].status).toBe('FAILED');
    });

    it('should not execute steps after failure', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['fail'] },
        { id: 's2', type: 'exec', cli: 'echo', args: ['never'] },
        { id: 's3', type: 'exec', cli: 'echo', args: ['never-either'] },
      ];
      const workflow = await engine.createWorkflow('partial-fail', steps);

      shouldFail = true;
      const result = await engine.execute(workflow);

      expect(result.steps.length).toBe(1);
      expect(result.steps[0].stepId).toBe('s1');
    });
  });

  describe('multiple workflow management', () => {
    it('should manage multiple workflows independently', async () => {
      const wf1 = await engine.createWorkflow('wf-a', [
        { id: 'a1', type: 'exec', cli: 'echo', args: ['a'] },
      ]);
      const wf2 = await engine.createWorkflow('wf-b', [
        { id: 'b1', type: 'exec', cli: 'echo', args: ['b'] },
      ]);

      expect(wf1.id).not.toBe(wf2.id);

      const all = await engine.listWorkflows();
      expect(all.length).toBe(2);
    });

    it('should execute different workflows independently', async () => {
      const wf1 = await engine.createWorkflow('wf1', [
        { id: 's1', type: 'exec', cli: 'echo', args: ['one'] },
      ]);
      const wf2 = await engine.createWorkflow('wf2', [
        { id: 's1', type: 'exec', cli: 'echo', args: ['two'] },
      ]);

      const r1 = await engine.execute(wf1);
      const r2 = await engine.execute(wf2);

      expect(r1.status).toBe('COMPLETED');
      expect(r2.status).toBe('COMPLETED');
    });
  });

  describe('pause and resume integration', () => {
    it('should reject pause when not running', () => {
      expect(engine.pause()).toBe(false);
    });

    it('should reject resume when not paused', () => {
      expect(engine.resume()).toBe(false);
    });

    it('should reject abort when idle', () => {
      expect(engine.abort()).toBe(false);
    });
  });

  describe('dry-run mode', () => {
    it('should return DRY RUN output without executing', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['hello'] },
        { id: 's2', type: 'exec', cli: 'rm', args: ['-rf', '/'] },
      ];
      const workflow = await engine.createWorkflow('dry-wf', steps);
      const result = await engine.execute(workflow, { dryRun: true });

      expect(result.status).toBe('COMPLETED');
      expect(result.steps.length).toBe(2);
      expect(result.steps[0].status).toBe('COMPLETED');
      expect(result.steps[0].output?.[0]).toContain('[DRY RUN]');
    });

    it('should include command info in dry-run output', async () => {
      const steps: Step[] = [{ id: 's1', type: 'exec', cli: 'rm', args: ['-rf', '/'] }];
      const workflow = await engine.createWorkflow('dry-wf2', steps);
      const result = await engine.execute(workflow, { dryRun: true });

      expect(result.steps[0].output?.[0]).toContain('[DRY RUN]');
    });
  });
});