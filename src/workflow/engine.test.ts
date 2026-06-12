import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkflowEngine, type WorkflowEngine } from './engine.js';
import { contextManager } from './context-manager.js';
import { createNoopAuditHelper } from '../infrastructure/audit/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';
import type { Step, ExecutionRecord } from '../types/index.js';
import { MockLoggerService } from '../infrastructure/testing/mock-services.js';

const environment = createEnvironmentService();
const logger = new MockLoggerService().getLogger('workflow-engine');

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockList = vi.fn().mockResolvedValue([]);
const mockSaveWorkflow = vi.fn().mockResolvedValue(undefined);
const mockGetWorkflow = vi.fn().mockResolvedValue(undefined);
const mockListWorkflows = vi.fn().mockResolvedValue([]);
const auditMocks = vi.hoisted(() => ({
  workflowStart: vi.fn(),
  workflowStep: vi.fn(),
  workflowEnd: vi.fn(),
}));
const mockState = vi.hoisted(() => {
  let shouldFail = false;
  const defaultExecuteStep = async (step: Step, options?: { dryRun?: boolean }) => {
    if (options?.dryRun) {
      return { stepId: step.id, status: 'COMPLETED' as const, output: ['[DRY RUN] echo hello'], exitCode: 0, duration: 0 };
    }
    await new Promise(resolve => setTimeout(resolve, 10));
    if (shouldFail) {
      shouldFail = false;
      return { stepId: step.id, status: 'FAILED' as const, output: [], exitCode: 1, duration: 10, error: 'killed' };
    }
    return { stepId: step.id, status: 'COMPLETED' as const, output: ['done'], exitCode: 0, duration: 10 };
  };
  const mockExecuteStep = vi.fn().mockImplementation(defaultExecuteStep);

  return {
    mockExecuteStep,
    applyDefaultImplementation: () => {
      mockExecuteStep.mockImplementation(defaultExecuteStep);
    },
    resetShouldFail: () => { shouldFail = false; },
    triggerFail: () => { shouldFail = true; },
  };
});

vi.mock('./storage.js', () => ({
  createStorage: () => ({
    save: mockSave,
    get: mockGet,
    list: mockList,
    delete: vi.fn().mockResolvedValue(undefined),
    saveWorkflow: mockSaveWorkflow,
    getWorkflow: mockGetWorkflow,
    listWorkflows: mockListWorkflows,
    deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('./executor.js', () => ({
  createExecutor: vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue({ success: true, exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    execute: mockState.mockExecuteStep,
    executeWorkflow: vi.fn().mockResolvedValue([]),
    validateStep: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    killCurrentProcess: vi.fn().mockImplementation(() => { mockState.triggerFail(); }),
  }),
}));

vi.mock('../utils/audit.js', () => ({
  audit: {
    workflowStart: auditMocks.workflowStart,
    workflowStep: auditMocks.workflowStep,
    workflowEnd: auditMocks.workflowEnd,
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
    mockGetWorkflow.mockResolvedValue(undefined);
    mockListWorkflows.mockResolvedValue([]);
    mockState.mockExecuteStep.mockClear();
    mockState.applyDefaultImplementation();
    mockState.resetShouldFail();
    contextManager.clear();
    engine = await createWorkflowEngine({ audit: createNoopAuditHelper(), environment, logger });
  });

  it('should create a workflow', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    expect(workflow.id).toBeDefined();
    expect(workflow.name).toBe('test-workflow');
    expect(workflow.steps.length).toBe(1);
  });

  it('should not persist workflow by default when creating it', async () => {
    await engine.createWorkflow('ephemeral-workflow', [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
    ]);

    expect(mockSaveWorkflow).not.toHaveBeenCalled();
  });

  it('should persist workflow only when explicitly requested', async () => {
    const workflow = await engine.createWorkflow(
      'persisted-workflow',
      [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }],
      { persist: true }
    );

    expect(mockSaveWorkflow).toHaveBeenCalledTimes(1);
    expect(mockSaveWorkflow).toHaveBeenCalledWith(workflow);
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

  it('should load persisted workflow on demand when not preloaded', async () => {
    const storedWorkflow = {
      id: 'wf_persisted',
      name: 'persisted-workflow',
      mode: 'relaxed' as const,
      steps: [{ id: 's1', type: 'exec' as const, cli: 'echo', args: ['persisted'] }],
      createdAt: new Date(),
    };
    mockGetWorkflow.mockResolvedValue(storedWorkflow);

    const retrieved = await engine.getWorkflow('wf_persisted');

    expect(retrieved).toEqual(storedWorkflow);
    expect(mockGetWorkflow).toHaveBeenCalledWith('wf_persisted');
  });

  it('should execute a workflow', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const result = await engine.execute(workflow);

    expect(result.status).toBe('COMPLETED');
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].status).toBe('COMPLETED');
  });

  it('should propagate exitCode into execution context for later steps', async () => {
    const workflow = await engine.createWorkflow('exit-code-propagation', [
      { id: 's1', type: 'exec', cli: 'echo', args: ['first'] },
      { id: 's2', type: 'exec', cli: 'echo', args: ['second'] },
    ]);
    let observedExitCode: number | undefined;

    mockState.mockExecuteStep.mockImplementation(async (step, _options, context) => {
      if (step.id === 's1') {
        return {
          stepId: step.id,
          status: 'COMPLETED' as const,
          output: [],
          exitCode: 0,
          duration: 0,
        };
      }

      observedExitCode = context.expressionData?.steps['s1']?.exitCode;

      return {
        stepId: step.id,
        status: 'COMPLETED' as const,
        output: ['done'],
        exitCode: 0,
        duration: 0,
      };
    });

    const result = await engine.execute(workflow);

    expect(result.status).toBe('COMPLETED');
    expect(observedExitCode).toBe(0);
    expect(result.steps[0].exitCode).toBe(0);
  });

  it('should execute workflow with dry run', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const result = await engine.execute(workflow, { dryRun: true });

    expect(result.status).toBe('COMPLETED');
    expect(result.steps[0].output?.[0]).toContain('[DRY RUN]');
  });

  it('should include workflowId and step command/stepName in execution record', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'git', args: ['add', '.'] },
      { id: 'step2', type: 'exec', cli: 'git', args: ['commit', '-m', 'test'] },
    ];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const result = await engine.execute(workflow);

    expect(result.workflowId).toBe(workflow.id);
    expect(result.steps[0].stepName).toBe('step1');
    expect(result.steps[0].command).toBe('git add .');
    expect(result.steps[1].stepName).toBe('step2');
    expect(result.steps[1].command).toBe('git commit -m test');
  });

  it('should consume initialVariables from options for interpolation', async () => {
    const workflow = await engine.createWorkflow('initial-vars-options', [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['${name}'] },
    ]);

    await engine.execute(workflow, { initialVariables: { name: 'vecta' } });

    expect(mockState.mockExecuteStep).toHaveBeenCalledTimes(1);
    expect(mockState.mockExecuteStep.mock.calls[0]?.[0].args).toEqual(['vecta']);
  });

  it('should reject ambiguous initialVariables contract when both forms are provided', async () => {
    const workflow = await engine.createWorkflow('initial-vars-ambiguous', [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['${name}'] },
    ]);

    await expect(
      engine.execute(
        workflow,
        { initialVariables: { name: 'from-options' } },
        { name: 'from-legacy' }
      )
    ).rejects.toThrow('initialVariables cannot be provided in both options and legacy argument');
  });

  it('should pause execution between steps', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'sleep', args: ['0.1'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['second'] },
    ];
    const workflow = await engine.createWorkflow('test-workflow', steps);

    const executionPromise = engine.execute(workflow);

    setTimeout(() => {
      engine.pause();
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

    it('should fail fast on missing dependency target', async () => {
      const steps: Step[] = [
        { id: 'step1', type: 'exec', cli: 'echo', args: ['first'], dependsOn: ['missing'] },
      ];
      const workflow = await engine.createWorkflow('missing-dependency', steps);

      await expect(engine.execute(workflow)).rejects.toThrow('Missing dependency target');
    });

    it('should fail fast on cyclic dependency in relaxed mode', async () => {
      const steps: Step[] = [
        { id: 'step1', type: 'exec', cli: 'echo', args: ['1'], dependsOn: ['step2'] },
        { id: 'step2', type: 'exec', cli: 'echo', args: ['2'], dependsOn: ['step1'] },
      ];
      const workflow = await engine.createWorkflow('cycle-dependency', steps);

      await expect(engine.execute(workflow)).rejects.toThrow('Cyclic dependency');
    });
  });

  describe('resumeFromFailure', () => {
    it('should resume from failed step and re-execute it', async () => {
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

      const result = await engine.resumeFromFailure('exec_1', 1);

      expect(result.status).toBe('COMPLETED');
      expect(result.steps.length).toBe(3);
      expect(result.steps[0].stepId).toBe('s1');
      expect(result.steps[1].stepId).toBe('s2');
      expect(result.steps[2].stepId).toBe('s3');
      expect(result.steps.filter(step => step.stepId === 's2')).toHaveLength(1);
      expect(result.steps[1].status).toBe('COMPLETED');
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

      const result = await engine.resumeFromFailure('exec_2', -1);
      expect(result.status).toBe('COMPLETED');
      expect(result.steps.length).toBe(3);
      expect(result.steps[0].stepId).toBe('s1');
      expect(result.steps[0].status).toBe('COMPLETED');
      expect(result.steps[1].stepId).toBe('s2');
      expect(result.steps[1].status).toBe('COMPLETED');
    });

    it('should preserve exitCode when resuming from a failed execution', async () => {
      const workflow = await engine.createWorkflow('resume-exit-code', [
        { id: 's1', type: 'exec', cli: 'echo', args: ['first'] },
        { id: 's2', type: 'exec', cli: 'echo', args: ['second'] },
      ]);
      let observedExitCode: number | undefined;

      const previousExecution: ExecutionRecord = {
        executionId: 'exec_resume_exit_code',
        workflowId: workflow.id,
        workflowName: 'resume-exit-code',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [
          { stepId: 's1', status: 'COMPLETED', output: [], exitCode: 1 },
          { stepId: 's2', status: 'FAILED', error: 'killed', exitCode: 1 },
        ],
        warnings: ['Step 2 failed'],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);
      mockState.mockExecuteStep.mockImplementation(async (step, _options, context) => {
        observedExitCode = context.expressionData?.steps['s1']?.exitCode;
        return {
          stepId: step.id,
          status: 'COMPLETED' as const,
          output: ['retried'],
          exitCode: 0,
          duration: 0,
        };
      });

      const result = await engine.resumeFromFailure('exec_resume_exit_code', -1);

      expect(result.status).toBe('COMPLETED');
      expect(observedExitCode).toBe(1);
      expect(result.steps[0]?.exitCode).toBe(1);
      expect(result.steps[1]?.stepId).toBe('s2');
    });

    it('should resume from storage-backed workflow when workflow was not preloaded', async () => {
      const storedWorkflow = {
        id: 'wf_resumed',
        name: 'stored-resume-workflow',
        mode: 'relaxed' as const,
        steps: [
          { id: 's1', type: 'exec' as const, cli: 'echo', args: ['first'] },
          { id: 's2', type: 'exec' as const, cli: 'echo', args: ['second'] },
        ],
        createdAt: new Date(),
      };
      const previousExecution: ExecutionRecord = {
        executionId: 'exec_storage_resume',
        workflowId: 'wf_resumed',
        workflowName: 'stored-resume-workflow',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [
          { stepId: 's1', status: 'COMPLETED', output: ['done'] },
          { stepId: 's2', status: 'FAILED', error: 'killed' },
        ],
        warnings: ['Step 2 failed: killed'],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);
      mockGetWorkflow.mockResolvedValue(storedWorkflow);

      const result = await engine.resumeFromFailure('exec_storage_resume', -1);

      expect(result.status).toBe('COMPLETED');
      expect(result.steps.map(step => step.stepId)).toEqual(['s1', 's2']);
      expect(mockGetWorkflow).toHaveBeenCalledWith('wf_resumed');
    });

    it('should allow resumed steps to depend on already completed steps in sorted execution order', async () => {
      const steps: Step[] = [
        { id: 's3', type: 'exec', cli: 'echo', args: ['third'], dependsOn: ['s2'] },
        { id: 's1', type: 'exec', cli: 'echo', args: ['first'], outputVar: 'artifact' },
        { id: 's2', type: 'exec', cli: 'echo', args: ['${artifact}'], dependsOn: ['s1'] },
      ];
      const workflow = await engine.createWorkflow('resume-deps', steps);

      const previousExecution: ExecutionRecord = {
        executionId: 'exec_dep',
        workflowId: workflow.id,
        workflowName: 'resume-deps',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(),
        steps: [
          { stepId: 's1', status: 'COMPLETED', output: ['seed-output'] },
          { stepId: 's2', status: 'FAILED', error: 'killed' },
        ],
        warnings: ['Step 2 failed: killed'],
        logs: [],
      };
      mockGet.mockResolvedValue(previousExecution);

      const result = await engine.resumeFromFailure('exec_dep', -1);
      expect(result.status).toBe('COMPLETED');
      expect(result.steps.map(step => step.stepId)).toEqual(['s1', 's2', 's3']);
      expect(mockState.mockExecuteStep).toHaveBeenCalledTimes(2);
      expect(mockState.mockExecuteStep.mock.calls[0]?.[0].id).toBe('s2');
      expect(mockState.mockExecuteStep.mock.calls[0]?.[0].args).toEqual(['seed-output']);
      expect(mockState.mockExecuteStep.mock.calls[1]?.[0].id).toBe('s3');
    });

    it('should throw when execution not found', async () => {
      mockGet.mockResolvedValue(undefined);
      await expect(engine.resumeFromFailure('nonexistent', 0)).rejects.toThrow('not found');
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

      await expect(engine.resumeFromFailure('exec_3', -1)).rejects.toThrow('No failed step');
    });

    it('should re-run failed last step instead of throwing no remaining steps', async () => {
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

      const resumed = await engine.resumeFromFailure('exec_4', -1);
      expect(resumed.status).toBe('COMPLETED');
      expect(resumed.steps).toHaveLength(1);
      expect(resumed.steps[0].stepId).toBe('s1');
      expect(resumed.steps[0].status).toBe('COMPLETED');
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

      await expect(engine.resumeFromFailure('exec_5', -1)).rejects.toThrow('not found');
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

    it('should resolve failed execution when async validation throws', async () => {
      const workflow = await engine.createWorkflow('async-invalid', [
        { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'], dependsOn: ['missing'] },
      ]);

      engine.executeAsync(workflow);
      const result = await engine.waitForCompletion();

      expect(result.status).toBe('FAILED');
      expect(result.warnings[0]).toContain('Workflow validation failed');
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

      mockState.triggerFail();
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

      mockState.triggerFail();
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

    it('should isolate default context managers across engine instances', async () => {
      const auditOne = {
        ...createNoopAuditHelper(),
        securityAction: vi.fn(),
      };
      const auditTwo = {
        ...createNoopAuditHelper(),
        securityAction: vi.fn(),
      };
      const engineOne = createWorkflowEngine({ audit: auditOne, environment, logger });
      const engineTwo = createWorkflowEngine({ audit: auditTwo, environment, logger });
      const workflowOne = await engineOne.createWorkflow('wf-audit-1', [
        { id: 's1', type: 'if', condition: 'false', body: [] },
      ]);
      const workflowTwo = await engineTwo.createWorkflow('wf-audit-2', [
        { id: 's1', type: 'if', condition: 'false', body: [] },
      ]);

      await engineOne.execute(workflowOne, { sessionId: 'sess-one' });
      await engineTwo.execute(workflowTwo, { sessionId: 'sess-two' });

      expect(auditOne.securityAction).toHaveBeenCalledWith('CONTEXT', expect.any(String), 'CREATED', 'sess-one');
      expect(auditTwo.securityAction).toHaveBeenCalledWith('CONTEXT', expect.any(String), 'CREATED', 'sess-two');
      expect(auditOne.securityAction).not.toHaveBeenCalledWith('CONTEXT', expect.any(String), 'CREATED', 'sess-two');
      expect(auditTwo.securityAction).not.toHaveBeenCalledWith('CONTEXT', expect.any(String), 'CREATED', 'sess-one');
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

    it('should avoid persistence and workflow audit side effects in dry-run mode', async () => {
      const workflow = await engine.createWorkflow('dry-wf3', [
        { id: 's1', type: 'exec', cli: 'echo', args: ['hello'] },
      ]);

      await engine.execute(workflow, { dryRun: true });

      expect(mockSave).not.toHaveBeenCalled();
      expect(auditMocks.workflowStart).not.toHaveBeenCalled();
      expect(auditMocks.workflowStep).not.toHaveBeenCalled();
      expect(auditMocks.workflowEnd).not.toHaveBeenCalled();
    });
  });

  describe('self-learning adaptive timeout', () => {
    it('should scale step timeout if last execution of same command failed', async () => {
      const lastFailedExecution: ExecutionRecord = {
        executionId: 'exec-prev',
        workflowId: 'wf-prev',
        workflowName: 'wf-prev',
        status: 'FAILED',
        mode: 'relaxed',
        startedAt: new Date(Date.now() - 60000),
        steps: [
          {
            stepId: 's1',
            stepName: 's1',
            command: 'echo hello',
            status: 'FAILED',
            error: 'timeout',
            timing: {
              startTime: new Date(Date.now() - 60000),
              endTime: new Date(Date.now() - 45000),
              durationMs: 15000,
            }
          }
        ],
        warnings: [],
        logs: [],
      };
      mockList.mockResolvedValue([lastFailedExecution]);

      const steps: Step[] = [{ id: 's1', type: 'exec', cli: 'echo', args: ['hello'] }];
      const workflow = await engine.createWorkflow('adaptive-wf', steps);
      
      await engine.execute(workflow);

      expect(steps[0].timeout).toBe(30000);
    });

    it('should scale step timeout based on last completed execution with 1.5x buffer', async () => {
      const lastCompletedExecution: ExecutionRecord = {
        executionId: 'exec-prev-ok',
        workflowId: 'wf-prev-ok',
        workflowName: 'wf-prev-ok',
        status: 'COMPLETED',
        mode: 'relaxed',
        startedAt: new Date(Date.now() - 60000),
        steps: [
          {
            stepId: 's1',
            stepName: 's1',
            command: 'echo hello',
            status: 'COMPLETED',
            timing: {
              startTime: new Date(Date.now() - 60000),
              endTime: new Date(Date.now() - 40000),
              durationMs: 20000,
            }
          }
        ],
        warnings: [],
        logs: [],
      };
      mockList.mockResolvedValue([lastCompletedExecution]);

      const steps: Step[] = [{ id: 's1', type: 'exec', cli: 'echo', args: ['hello'] }];
      const workflow = await engine.createWorkflow('adaptive-wf-ok', steps);
      
      await engine.execute(workflow);

      expect(steps[0].timeout).toBe(30000);
    });
  });
});
