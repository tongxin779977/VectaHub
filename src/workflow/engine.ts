import type { Workflow, Step, ExecutionRecord, StepRecord, ExecutionStatus } from '../types/index.js';
import { createExecutor, type Executor, type ExecutorOptions, type ExecutionContext } from './executor.js';
import { createStorage, type Storage } from './storage.js';
import { interpolateStep, type InterpolationContext } from './interpolation.js';
import { createExecutionStateManager, type ExecutionStateManager } from './state-manager.js';
import { createContextManager, type ContextManager, type ExecutorContext } from './context-manager.js';
import { topologicalSort } from './dag.js';
import { audit } from '../utils/audit.js';
import { createRetryManager } from '../skills/iterative-refinement/retry-manager.js';
import { generateId } from '../execution/id-generator.js';

export interface RetryOptions {
  maxAttempts?: number;
  backoffMultiplier?: number;
  initialBackoff?: number;
}

export interface ProgressInfo {
  currentStep: number;
  totalSteps: number;
  stepId: string;
  stepType: string;
  status: 'starting' | 'completed' | 'failed';
}

export interface ExecuteOptions {
  dryRun?: boolean;
  timeout?: number;
  mode?: 'strict' | 'relaxed' | 'consensus';
  retry?: RetryOptions;
  onProgress?: (info: ProgressInfo) => void;
  initialVariables?: Record<string, unknown>; // Add this line
}

export interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[]): Promise<Workflow>;
  addStep(workflowId: string, step: Step): Promise<void>;
  removeStep(workflowId: string, stepId: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  execute(workflow: Workflow, options?: ExecuteOptions, initialVariables?: Record<string, unknown>): Promise<ExecutionRecord>;
  executeAsync(workflow: Workflow, options?: ExecuteOptions): void;
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  getStatus(): ExecutionRecord | undefined;
  waitForCompletion(): Promise<ExecutionRecord>;
  loadWorkflows(): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | undefined>;
resumeFromFailure(executionId: string, stepIndex?: number, options?: ExecuteOptions): Promise<ExecutionRecord>;
}

let workflowCounter = 0;

let currentEngine: WorkflowEngine | null = null;

interface RunLoopOptions {
  workflow: Workflow;
  steps: Step[];
  executorOptions: ExecutorOptions;
  contextManager: ContextManager;
  initialVariables?: Record<string, unknown>;
  initialSteps?: StepRecord[];
  initialWarnings?: string[];
  sessionId?: string;
  onProgress?: (info: ProgressInfo) => void;
}

function toInterpolationContext(executorCtx: ExecutorContext, executionId?: string): InterpolationContext {
  return {
    variables: executorCtx.variables,
    previousOutputs: executorCtx.previousOutputs,
    executionId,
  };
}

async function runExecutionLoop(
  sm: ExecutionStateManager,
  executor: Executor,
  storage: Storage,
  options: RunLoopOptions
): Promise<ExecutionRecord> {
  const {
    workflow,
    steps,
    executorOptions,
    contextManager,
    initialVariables,
    initialSteps,
    initialWarnings,
    sessionId = 'unknown',
    onProgress,
  } = options;

  const newExecutionId = generateId();
  const startedAt = new Date();

  const context = contextManager.createContext(
    workflow.id,
    newExecutionId,
    sessionId,
    initialVariables || {}
  );

  sm.currentExecution = {
    executionId: newExecutionId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'RUNNING',
    mode: workflow.mode,
    startedAt,
    steps: [...(initialSteps || [])],
    warnings: [...(initialWarnings || [])],
    logs: [],
  };

  sm.setState('RUNNING');

  audit.workflowStart(workflow.id, workflow.name, sessionId, {
    stepCount: steps.length,
    mode: workflow.mode,
  });

  const sortedSteps = topologicalSort(steps, workflow.mode);

  for (let i = 0; i < sortedSteps.length; i++) {
    sm.currentStepIndex = i;
    const step = sortedSteps[i];

    if (onProgress) {
      onProgress({
        currentStep: i + 1,
        totalSteps: sortedSteps.length,
        stepId: step.id,
        stepType: step.type,
        status: 'starting',
      });
    }

    if (sm.state === 'ABORTING' || sm.state === 'ABORTED') {
      sm.currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
      break;
    }

    let shouldContinuePausing = sm.state === 'PAUSED';
    let loopAborted = false;
    while (shouldContinuePausing) {
      await new Promise<void>((resolve) => {
        sm.pauseResolver = resolve;
      });
      sm.pauseResolver = null;

      if (sm.state === 'ABORTING' || sm.state === 'ABORTED') {
        sm.currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
        loopAborted = true;
        break;
      }
      shouldContinuePausing = sm.state === 'PAUSED';
    }

    if (loopAborted) break;

    try {
      const executorContext = contextManager.toExecutorContext(newExecutionId);
      const interpolatedStep = interpolateStep(step, toInterpolationContext(executorContext, newExecutionId));
      const result = await executor.execute(interpolatedStep, executorOptions, executorContext);

      const stepRecord: StepRecord = {
        stepId: step.id,
        status: result.status as ExecutionStatus,
        startAt: new Date(startedAt.getTime() + (result.duration || 0)),
        endAt: new Date(),
        output: result.output,
        error: result.error,
        iterations: result.iterations,
      };

      sm.currentExecution.steps.push(stepRecord);

      audit.workflowStep(
        step.id,
        step.cli || '',
        step.args || [],
        sessionId,
        { status: result.status, iterations: result.iterations }
      );

      const storageKey = (step as unknown as Record<string, unknown>).outputVar as string || step.id;
      if (result.output) {
        contextManager.setStepOutput(newExecutionId, storageKey, result.output, {
          stdout: result.output.join('\n'),
        });
      }

      if (result.status === 'FAILED') {
        if (onProgress) {
          onProgress({
            currentStep: i + 1,
            totalSteps: sortedSteps.length,
            stepId: step.id,
            stepType: step.type,
            status: 'failed',
          });
        }
        sm.setState('FAILED');
        sm.currentExecution.warnings.push(`Step ${i + 1} failed: ${result.error}`);
        break;
      }

      if (onProgress) {
        onProgress({
          currentStep: i + 1,
          totalSteps: sortedSteps.length,
          stepId: step.id,
          stepType: step.type,
          status: 'completed',
        });
      }
    } catch (error) {
      const stepRecord: StepRecord = {
        stepId: step.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      };
      sm.currentExecution.steps.push(stepRecord);
      if (onProgress) {
        onProgress({
          currentStep: i + 1,
          totalSteps: sortedSteps.length,
          stepId: step.id,
          stepType: step.type,
          status: 'failed',
        });
      }
      sm.setState('FAILED');
      break;
    }
  }

  if (sm.state === 'RUNNING') {
    sm.setState('COMPLETED');
  }

  sm.currentExecution.endedAt = new Date();
  sm.currentExecution.duration = sm.currentExecution.endedAt.getTime() - startedAt.getTime();

  await storage.save(sm.currentExecution);

  audit.workflowEnd(
    workflow.id,
    sm.currentExecution.status,
    sm.currentExecution.duration || 0,
    sessionId
  );

  if (sm.completionResolver) {
    sm.completionResolver(sm.currentExecution);
    sm.completionResolver = null;
    sm.completionPromise = null;
  }

  contextManager.deleteContext(newExecutionId);

  return sm.currentExecution;
}

export function createWorkflowEngine(): WorkflowEngine {
  const workflows = new Map<string, Workflow>();
  const executor = createExecutor();
  const storage = createStorage();
  const sm = createExecutionStateManager();
  const contextManager = createContextManager();

  function buildExecutorOptions(
    workflow: Workflow,
    options: ExecuteOptions = {}
  ): ExecutorOptions {
    const modeStr = options.mode || workflow.mode;
    const mode = modeStr === 'strict' ? 'STRICT' : modeStr === 'consensus' ? 'CONSENSUS' : 'RELAXED';
    return {
      mode,
      dryRun: options.dryRun,
      timeout: options.timeout || 30000,
    };
  }

  async function executeWorkflowInternal(
    workflow: Workflow,
    options: ExecuteOptions = {},
    initialVariables?: Record<string, unknown> // Add initialVariables parameter
  ): Promise<ExecutionRecord> {
    return runExecutionLoop(sm, executor, storage, {
      workflow,
      steps: workflow.steps,
      executorOptions: buildExecutorOptions(workflow, options),
      contextManager,
      initialVariables, // Pass initialVariables
      onProgress: options.onProgress,
    });
  }

  return {
    async createWorkflow(name: string, steps: Step[]): Promise<Workflow> {
      const workflow: Workflow = {
        id: `wf_${++workflowCounter}`,
        name,
        mode: 'relaxed',
        steps,
        createdAt: new Date(),
      };
      workflows.set(workflow.id, workflow);
      await storage.saveWorkflow(workflow);
      return workflow;
    },

    async addStep(workflowId: string, step: Step): Promise<void> {
      const wf = workflows.get(workflowId);
      if (wf) {
        wf.steps.push(step);
        await storage.saveWorkflow(wf);
      }
    },

    async removeStep(workflowId: string, stepId: string): Promise<void> {
      const wf = workflows.get(workflowId);
      if (wf) {
        wf.steps = wf.steps.filter((s) => s.id !== stepId);
        await storage.saveWorkflow(wf);
      }
    },

    async getWorkflow(id: string): Promise<Workflow | undefined> {
      return workflows.get(id);
    },

    async listWorkflows(): Promise<Workflow[]> {
      return Array.from(workflows.values());
    },

    async execute(
      workflow: Workflow,
      options: ExecuteOptions = {},
      initialVariables?: Record<string, unknown> // Add initialVariables
    ): Promise<ExecutionRecord> {
      const retryMgr = createRetryManager({
        maxAttempts: options.retry?.maxAttempts || 1,
        backoffMultiplier: options.retry?.backoffMultiplier || 2,
        initialBackoff: options.retry?.initialBackoff || 1000,
      });

      const executeOnce = async () => {
        return executeWorkflowInternal(workflow, options, initialVariables); // Pass initialVariables
      };

      const result = await retryMgr.executeWithRetry(executeOnce);
      if (result.result) {
        return result.result;
      }
      throw new Error(result.finalError || 'Execution failed after retries');
    },

    async loadWorkflows(): Promise<void> {
      const storedWorkflows = await storage.listWorkflows();
      for (const wf of storedWorkflows) {
        workflows.set(wf.id, wf);
        const idNum = parseInt(wf.id.replace('wf_', ''));
        if (idNum > workflowCounter) {
          workflowCounter = idNum;
        }
      }
    },

    executeAsync(workflow: Workflow, options: ExecuteOptions = {}): void {
      sm.completionPromise = new Promise((resolve) => {
        sm.completionResolver = resolve;
      });
      executeWorkflowInternal(workflow, options).then((record) => {
        if (sm.completionResolver) {
          sm.completionResolver(record);
        }
      });
    },

    pause(): boolean {
      if (sm.state !== 'RUNNING') {
        return false;
      }

      sm.setState('PAUSING');
      executor.killCurrentProcess();
      sm.setState('PAUSED');

      return true;
    },

    resume(): boolean {
      if (sm.state !== 'PAUSED') {
        return false;
      }

      sm.setState('RUNNING');

      (sm.pauseResolver as (() => void) | null)?.();

      return true;
    },

    abort(): boolean {
      if (sm.state !== 'RUNNING' && sm.state !== 'PAUSED' && sm.state !== 'PAUSING') {
        return false;
      }

      sm.setState('ABORTING');
      executor.killCurrentProcess();

      (sm.pauseResolver as (() => void) | null)?.();

      if (sm.currentExecution) {
        sm.currentExecution.status = 'FAILED';
        sm.currentExecution.endedAt = new Date();
      }

      sm.setState('ABORTED');
      return true;
    },

    getStatus(): ExecutionRecord | undefined {
      return sm.currentExecution;
    },

    waitForCompletion(): Promise<ExecutionRecord> {
      if (sm.state === 'IDLE' || sm.state === 'COMPLETED' || sm.state === 'FAILED' || sm.state === 'ABORTED') {
        if (sm.currentExecution) {
          return Promise.resolve(sm.currentExecution);
        }
        return Promise.reject(new Error('No execution in progress'));
      }

      if (!sm.completionPromise) {
        sm.completionPromise = new Promise((resolve) => {
          sm.completionResolver = resolve;
        });
      }

      return sm.completionPromise;
    },

    async getExecution(id: string): Promise<ExecutionRecord | undefined> {
      return storage.get(id);
    },

    async resumeFromFailure(executionId: string, stepIndex = -1, options?: ExecuteOptions): Promise<ExecutionRecord> {
      const previousExecution = await storage.get(executionId);
      if (!previousExecution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      const workflow = workflows.get(previousExecution.workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${previousExecution.workflowId} not found`);
      }

      let failedStepIndex = stepIndex;
      if (failedStepIndex < 0) {
        failedStepIndex = previousExecution.steps.findIndex(
          s => s.status === 'FAILED'
        );
      }

      if (failedStepIndex === -1) {
        throw new Error(`No failed step found in execution ${executionId}`);
      }

      const remainingSteps = workflow.steps.slice(failedStepIndex + 1);
      if (remainingSteps.length === 0) {
        throw new Error(`No remaining steps to execute after step ${failedStepIndex + 1}`);
      }

      const initialVariables: Record<string, unknown> = {};
      for (const stepRecord of previousExecution.steps) {
        if (stepRecord.output) {
          initialVariables[stepRecord.stepId] = stepRecord.output;
        }
      }

      return runExecutionLoop(sm, executor, storage, {
        workflow,
        steps: remainingSteps,
        executorOptions: buildExecutorOptions(workflow, options || {}),
        contextManager,
        initialVariables,
        initialSteps: [...previousExecution.steps],
        initialWarnings: [...previousExecution.warnings],
      });
    },
  };
}
