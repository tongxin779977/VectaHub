import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowEngine, type WorkflowEngine } from './engine.js';
import type { ExecutionRecord, Step } from '../types/index.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockList = vi.fn().mockResolvedValue([]);
const mockSaveWorkflow = vi.fn().mockResolvedValue(undefined);
const mockGetWorkflow = vi.fn().mockResolvedValue(undefined);
const mockListWorkflows = vi.fn().mockResolvedValue([]);

const contextState = vi.hoisted(() => {
  const contexts = new Map<string, { variables: Record<string, string[]>; previousOutputs: Record<string, string[]> }>();
  const setStepOutput = vi.fn((executionId: string, stepId: string, output: unknown, metadata?: { outputVar?: string }) => {
    const context = contexts.get(executionId);
    if (!context) {
      throw new Error(`Context not found: ${executionId}`);
    }

    const normalizedOutput = Array.isArray(output) ? output.map(String) : [String(output)];
    context.previousOutputs[stepId] = normalizedOutput;
    if (metadata?.outputVar) {
      context.previousOutputs[metadata.outputVar] = normalizedOutput;
    }
  });

  return {
    contexts,
    setStepOutput,
    reset: (): void => {
      contexts.clear();
      setStepOutput.mockClear();
    },
  };
});

const mockExecute = vi.hoisted(() => vi.fn());

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

vi.mock('./context-manager.js', () => ({
  contextManager: {
    createContext: (
      _workflowId: string,
      executionId: string,
      _sessionId: string,
      initialVars: Record<string, unknown> = {}
    ) => {
      const variables: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(initialVars)) {
        if (Array.isArray(value)) {
          variables[key] = value.map(String);
        } else {
          variables[key] = [String(value)];
        }
      }
      contextState.contexts.set(executionId, { variables, previousOutputs: {} });
    },
    toExecutorContext: (executionId: string) => {
      const context = contextState.contexts.get(executionId);
      if (!context) {
        return { variables: {}, previousOutputs: {}, executionId };
      }
      return { variables: context.variables, previousOutputs: context.previousOutputs, executionId };
    },
    setStepOutput: contextState.setStepOutput,
    deleteContext: (executionId: string) => {
      contextState.contexts.delete(executionId);
    },
  },
}));

vi.mock('./executor.js', () => ({
  createExecutor: vi.fn().mockReturnValue({
    exec: vi.fn(),
    execute: mockExecute,
    executeWorkflow: vi.fn().mockResolvedValue([]),
    validateStep: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    killCurrentProcess: vi.fn(),
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

describe('WorkflowEngine exitCode propagation', () => {
  let engine: WorkflowEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    contextState.reset();
    mockSave.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(undefined);
    mockList.mockResolvedValue([]);
    mockSaveWorkflow.mockResolvedValue(undefined);
    mockGetWorkflow.mockResolvedValue(undefined);
    mockListWorkflows.mockResolvedValue([]);
    engine = await createWorkflowEngine();
  });

  it('should write handler exitCode into runtime step output metadata', async () => {
    mockExecute.mockImplementation(async (step: Step) => ({
      stepId: step.id,
      status: 'COMPLETED' as const,
      output: ['done'],
      exitCode: 7,
      duration: 1,
    }));

    const workflow = await engine.createWorkflow('exit-code-runtime', [
      { id: 'build', type: 'exec', cli: 'echo', args: ['build'] },
    ]);

    await engine.execute(workflow);

    expect(contextState.setStepOutput).toHaveBeenCalledTimes(1);
    expect(contextState.setStepOutput).toHaveBeenCalledWith(
      expect.any(String),
      'build',
      ['done'],
      expect.objectContaining({
        stdout: 'done',
        exitCode: 7,
      })
    );
  });

  it('should seed preserved exitCode into resumed execution context', async () => {
    mockExecute.mockImplementation(async (step: Step) => ({
      stepId: step.id,
      status: 'COMPLETED' as const,
      output: ['recovered'],
      exitCode: 0,
      duration: 1,
    }));

    const workflow = await engine.createWorkflow('resume-exit-code', [
      { id: 's1', type: 'exec', cli: 'echo', args: ['first'] },
      { id: 's2', type: 'exec', cli: 'echo', args: ['second'] },
    ]);

    const previousExecution: ExecutionRecord = {
      executionId: 'exec-with-exit-code',
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'FAILED',
      mode: 'relaxed',
      startedAt: new Date(),
      steps: [
        { stepId: 's1', status: 'COMPLETED', output: ['artifact'], exitCode: 0 },
        { stepId: 's2', status: 'FAILED', error: 'boom' },
      ],
      warnings: ['Step 2 failed: boom'],
      logs: [],
    };
    mockGet.mockResolvedValue(previousExecution);

    await engine.resumeFromFailure(previousExecution.executionId, -1);

    expect(contextState.setStepOutput).toHaveBeenCalled();
    expect(contextState.setStepOutput).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      's1',
      ['artifact'],
      expect.objectContaining({
        stdout: 'artifact',
        exitCode: 0,
      })
    );
  });
});
