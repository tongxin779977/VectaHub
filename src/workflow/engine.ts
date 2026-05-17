import type { Workflow, Step, ExecutionRecord, StepRecord, ExecutionStatus } from '../types/index.js';
import { createExecutor, type Executor, type ExecutorOptions } from './executor.js';
import { createStorage, type Storage } from './storage.js';
import { interpolateStep, type InterpolationContext } from './interpolation.js';
import { createExecutionStateManager, type ExecutionStateManager } from './state-manager.js';
import { createContextManager, type ContextManager, type ExecutorContext } from './context-manager.js';
import { topologicalSort, validateDependencies } from './dag.js';
import { audit } from '../utils/audit.js';
import { createRetryManager } from '../skills/iterative-refinement/retry-manager.js';
import { generateId } from '../execution/id-generator.js';
import { SYSTEM_WORKFLOWS } from './system-workflows.js';

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
  getSystemWorkflow(id: string): Promise<Workflow | undefined>;
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

interface RunLoopOptions {
  workflow: Workflow;
  steps: Step[];
  executorOptions: ExecutorOptions;
  contextManager: ContextManager;
  initialVariables?: Record<string, unknown>;
  initialSteps?: StepRecord[];
  seedOutputs?: Array<{ stepKey: string; output: unknown[] }>;
  satisfiedDependencyIds?: string[];
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
    seedOutputs,
    satisfiedDependencyIds,
    initialWarnings,
    sessionId = 'unknown',
    onProgress,
  } = options;

  const newExecutionId = generateId();
  const startedAt = new Date();

  contextManager.createContext(
    workflow.id,
    newExecutionId,
    sessionId,
    initialVariables || {}
  );

  for (const seededOutput of seedOutputs || []) {
    contextManager.setStepOutput(newExecutionId, seededOutput.stepKey, seededOutput.output, {
      stdout: seededOutput.output.map(value => String(value)).join('\n'),
    });
  }

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

  const finalizeExecution = async (): Promise<void> => {
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
  };

  let sortedSteps: Step[];
  try {
    validateDependencies(steps, satisfiedDependencyIds);
    sortedSteps = topologicalSort(steps, workflow.mode, satisfiedDependencyIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sm.setState('FAILED');
    sm.currentExecution.warnings.push(`Workflow validation failed: ${message}`);
    await finalizeExecution();
    throw error;
  }

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

  await finalizeExecution();
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
      return SYSTEM_WORKFLOWS[id] || workflows.get(id);
    },

    async getSystemWorkflow(id: string): Promise<Workflow | undefined> {
      return SYSTEM_WORKFLOWS[id];
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
      // 加载系统工作流
      for (const [id, wf] of Object.entries(SYSTEM_WORKFLOWS)) {
        workflows.set(id, wf);
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

      const failedStepRecord = previousExecution.steps[failedStepIndex];
      if (!failedStepRecord) {
        throw new Error(`Failed step index ${failedStepIndex} out of range for execution ${executionId}`);
      }

      const sortedWorkflowSteps = topologicalSort(workflow.steps, workflow.mode);
      const failedWorkflowStepIndex = sortedWorkflowSteps.findIndex(step => step.id === failedStepRecord.stepId);
      if (failedWorkflowStepIndex === -1) {
        throw new Error(`Failed step ${failedStepRecord.stepId} not found in workflow ${workflow.id}`);
      }

      const resumedSteps = sortedWorkflowSteps.slice(failedWorkflowStepIndex);
      if (resumedSteps.length === 0) {
        throw new Error(`No remaining steps to execute from failed step ${failedStepRecord.stepId}`);
      }

      const completedRecordsById = new Map(
        previousExecution.steps
          .filter(stepRecord => stepRecord.status === 'COMPLETED')
          .map(stepRecord => [stepRecord.stepId, stepRecord] as const)
      );
      const preservedSteps = sortedWorkflowSteps
        .slice(0, failedWorkflowStepIndex)
        .map(step => completedRecordsById.get(step.id))
        .filter((stepRecord): stepRecord is StepRecord => Boolean(stepRecord));

      const initialVariables: Record<string, unknown> = {};
      const seedOutputs: Array<{ stepKey: string; output: unknown[] }> = [];
      for (const stepRecord of preservedSteps) {
        if (stepRecord.status === 'COMPLETED' && stepRecord.output) {
          const workflowStep = sortedWorkflowSteps.find(step => step.id === stepRecord.stepId);
          const storageKey = (workflowStep as unknown as Record<string, unknown> | undefined)?.outputVar as string | undefined
            ?? stepRecord.stepId;
          initialVariables[storageKey] = stepRecord.output;
          seedOutputs.push({ stepKey: storageKey, output: stepRecord.output });
        }
      }

      const satisfiedDependencyIds = preservedSteps.map(stepRecord => stepRecord.stepId);
      const resumedWarnings = previousExecution.warnings.filter(
        warning => !/^Step \d+ failed:/.test(warning)
      );

      return runExecutionLoop(sm, executor, storage, {
        workflow,
        steps: resumedSteps,
        executorOptions: buildExecutorOptions(workflow, options || {}),
        contextManager,
        initialVariables,
        initialSteps: [...preservedSteps],
        seedOutputs,
        satisfiedDependencyIds,
        initialWarnings: [...resumedWarnings],
      });
    },
  };
}
