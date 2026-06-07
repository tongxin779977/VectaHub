import type { Workflow, Step, ExecutionRecord, StepRecord, ExecutionStatus } from '../types/index.js';
import { createExecutor, type Executor, type ExecutorOptions } from './executor.js';
import { createStorage, type Storage } from './storage.js';
import { interpolateStep, type InterpolationContext } from './interpolation.js';
import { createExecutionStateManager, type ExecutionStateManager } from './state-manager.js';
import { createContextManager, type ContextManager, type ExecutorContext } from './context-manager.js';
import { topologicalSort, validateDependencies } from './dag.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import { createSecurityGuard } from '../security-protocol/factory.js';
import type { SecurityGuard } from '../types/security.js';
import { createRetryManager } from '../skills/iterative-refinement/retry-manager.js';
import { generateId } from '../execution/id-generator.js';
import { createSystemWorkflows } from './system-workflows.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';

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
  initialVariables?: Record<string, unknown>;
  sessionId?: string;
}

export interface CreateWorkflowOptions {
  persist?: boolean;
}

/**
 * 工作流引擎依赖注入接口
 * 用于支持自定义替换各个组件，提高可测试性
 */
export interface WorkflowEngineDeps {
  executor?: Executor;
  storage?: Storage;
  contextManager?: ContextManager;
  stateManager?: ExecutionStateManager;
  audit: AuditHelper;
  securityGuard?: SecurityGuard;
  environment: IEnvironmentService;
  logger: pino.Logger;
}

export interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[], options?: CreateWorkflowOptions): Promise<Workflow>;
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
  seedOutputs?: Array<{ stepId: string; outputVar?: string; output: unknown[]; exitCode?: number }>;
  satisfiedDependencyIds?: string[];
  initialWarnings?: string[];
  sessionId?: string;
  onProgress?: (info: ProgressInfo) => void;
  auditHelper: AuditHelper;
  environment: IEnvironmentService;
}

function toInterpolationContext(executorCtx: ExecutorContext, executionId?: string): InterpolationContext {
  return {
    variables: executorCtx.variables,
    previousOutputs: executorCtx.previousOutputs,
    executionId,
    expressionData: executorCtx.expressionData,
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
    auditHelper,
    environment,
  } = options;
  const isDryRun = Boolean(executorOptions.dryRun);

  const newExecutionId = generateId();
  const startedAt = new Date();

  contextManager.createContext(
    workflow.id,
    newExecutionId,
    sessionId,
    initialVariables || {},
    environment.getCwd(),
    { auditEnabled: !isDryRun }
  );

  for (const seededOutput of seedOutputs || []) {
    contextManager.setStepOutput(newExecutionId, seededOutput.stepId, seededOutput.output, {
      stdout: seededOutput.output.map(value => String(value)).join('\n'),
      exitCode: seededOutput.exitCode,
      outputVar: seededOutput.outputVar,
    });
  }

  const currentExecution: ExecutionRecord = {
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
  sm.currentExecution = currentExecution;

  sm.setState('RUNNING');
  const isAbortState = (): boolean => sm.state === 'ABORTING' || sm.state === 'ABORTED';

  if (!isDryRun) {
    auditHelper.workflowStart(workflow.id, workflow.name, sessionId, {
      stepCount: steps.length,
      mode: workflow.mode,
    });
  }

  const finalizeExecution = async (): Promise<void> => {
    currentExecution.endedAt = new Date();
    currentExecution.duration = currentExecution.endedAt.getTime() - startedAt.getTime();

    if (!isDryRun) {
      await storage.save(currentExecution);

      auditHelper.workflowEnd(
        workflow.id,
        currentExecution.status,
        currentExecution.duration || 0,
        sessionId
      );
    }

    if (sm.completionResolver) {
      sm.completionResolver(currentExecution);
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
    currentExecution.warnings.push(`Workflow validation failed: ${message}`);
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

    if (isAbortState()) {
      currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
      break;
    }

    let shouldContinuePausing = sm.state === 'PAUSED';
    let loopAborted = false;
    while (shouldContinuePausing) {
      await new Promise<void>((resolve) => {
        sm.pauseResolver = resolve;
      });
      sm.pauseResolver = null;

      if (isAbortState()) {
        currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
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
      const abortedAfterExecution = isAbortState();
      const stepStatus = abortedAfterExecution ? 'ABORTED' : result.status;

      const stepRecord: StepRecord = {
        stepId: step.id,
        stepName: step.id,
        command: [step.cli, ...(step.args || [])].filter(Boolean).join(' '),
        status: stepStatus as ExecutionStatus,
        startAt: new Date(startedAt.getTime() + (result.duration || 0)),
        endAt: new Date(),
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        iterations: result.iterations,
      };

      currentExecution.steps.push(stepRecord);

      if (!isDryRun) {
        auditHelper.workflowStep(
          step.id,
          step.cli || '',
          step.args || [],
          sessionId,
          { status: result.status, iterations: result.iterations }
        );
      }

      if (result.output) {
        contextManager.setStepOutput(newExecutionId, step.id, result.output, {
          stdout: result.output.join('\n'),
          exitCode: result.exitCode,
          outputVar: step.outputVar,
        });
      }

      if (abortedAfterExecution) {
        currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
        break;
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
        currentExecution.warnings.push(`Step ${i + 1} failed: ${result.error}`);
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
      if (isAbortState()) {
        currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
        break;
      }
      const stepRecord: StepRecord = {
        stepId: step.id,
        stepName: step.id,
        command: [step.cli, ...(step.args || [])].filter(Boolean).join(' '),
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      };
      currentExecution.steps.push(stepRecord);
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
  return currentExecution;
}

export function createWorkflowEngine(deps: WorkflowEngineDeps): WorkflowEngine {
  const workflows = new Map<string, Workflow>();
  const environment = deps.environment;
  const logger = deps.logger;
  const securityGuard: SecurityGuard = deps.securityGuard ?? createSecurityGuard();
  const executor = deps.executor ?? createExecutor({ environment, audit: deps.audit, securityGuard });
  const storage = deps.storage ?? createStorage({ environment, logger });
  const sm = deps.stateManager ?? createExecutionStateManager();
  const contextManager: ContextManager = deps.contextManager ?? createContextManager({ audit: deps.audit, environment });
  const auditHelper: AuditHelper = deps.audit;
  const systemWorkflows = createSystemWorkflows(environment);

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
      sessionId: options.sessionId,
    };
  }

  function resolveInitialVariables(
    options: ExecuteOptions = {},
    legacyInitialVariables?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (options.initialVariables !== undefined && legacyInitialVariables !== undefined) {
      throw new Error('initialVariables cannot be provided in both options and legacy argument');
    }
    return options.initialVariables ?? legacyInitialVariables;
  }

  async function resolveWorkflow(id: string): Promise<Workflow | undefined> {
    const systemWorkflow = systemWorkflows[id];
    if (systemWorkflow) {
      return systemWorkflow;
    }

    const inMemoryWorkflow = workflows.get(id);
    if (inMemoryWorkflow) {
      return inMemoryWorkflow;
    }

    const storedWorkflow = await storage.getWorkflow(id);
    if (storedWorkflow) {
      workflows.set(storedWorkflow.id, storedWorkflow);
    }
    return storedWorkflow;
  }

  async function executeWorkflowInternal(
    workflow: Workflow,
    options: ExecuteOptions = {},
    initialVariables?: Record<string, unknown>
  ): Promise<ExecutionRecord> {
    return runExecutionLoop(sm, executor, storage, {
      workflow,
      steps: workflow.steps,
      executorOptions: buildExecutorOptions(workflow, options),
      contextManager,
      initialVariables,
      onProgress: options.onProgress,
      sessionId: options.sessionId,
      auditHelper,
      environment,
    });
  }

  return {
    async createWorkflow(
      name: string,
      steps: Step[],
      options: CreateWorkflowOptions = {}
    ): Promise<Workflow> {
      const workflow: Workflow = {
        id: `wf_${++workflowCounter}`,
        name,
        mode: 'relaxed',
        steps,
        createdAt: new Date(),
      };
      workflows.set(workflow.id, workflow);
      if (options.persist === true) {
        await storage.saveWorkflow(workflow);
      }
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
      return resolveWorkflow(id);
    },

    async getSystemWorkflow(id: string): Promise<Workflow | undefined> {
      return systemWorkflows[id];
    },

    async listWorkflows(): Promise<Workflow[]> {
      return Array.from(workflows.values());
    },

    async execute(
      workflow: Workflow,
      options: ExecuteOptions = {},
      initialVariables?: Record<string, unknown>
    ): Promise<ExecutionRecord> {
      const normalizedInitialVariables = resolveInitialVariables(options, initialVariables);
      const retryMgr = createRetryManager({
        maxAttempts: options.retry?.maxAttempts || 1,
        backoffMultiplier: options.retry?.backoffMultiplier || 2,
        initialBackoff: options.retry?.initialBackoff || 1000,
      });

      const executeOnce = async () => {
        return executeWorkflowInternal(workflow, options, normalizedInitialVariables);
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
      for (const [id, wf] of Object.entries(systemWorkflows)) {
        workflows.set(id, wf);
      }
    },

    executeAsync(workflow: Workflow, options: ExecuteOptions = {}): void {
      const normalizedInitialVariables = resolveInitialVariables(options);
      sm.completionPromise = new Promise((resolve) => {
        sm.completionResolver = resolve;
      });
      executeWorkflowInternal(workflow, options, normalizedInitialVariables).then((record) => {
        if (sm.completionResolver) {
          sm.completionResolver(record);
        }
      }).catch(() => {
        if (sm.currentExecution && sm.completionResolver) {
          sm.completionResolver(sm.currentExecution);
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
      sm.setState('ABORTED');
      return true;
    },

    getStatus(): ExecutionRecord | undefined {
      return sm.currentExecution;
    },

    waitForCompletion(): Promise<ExecutionRecord> {
      if (sm.completionPromise) {
        return sm.completionPromise;
      }

      if (sm.currentExecution) {
        const terminalStatuses: ExecutionStatus[] = ['COMPLETED', 'FAILED', 'ABORTED'];
        if (terminalStatuses.includes(sm.currentExecution.status)) {
          return Promise.resolve(sm.currentExecution);
        }
        sm.completionPromise = new Promise((resolve) => {
          sm.completionResolver = resolve;
        });
        return sm.completionPromise;
      }

      return Promise.reject(new Error('No execution in progress'));
    },

    async getExecution(id: string): Promise<ExecutionRecord | undefined> {
      return storage.get(id);
    },

    async resumeFromFailure(executionId: string, stepIndex = -1, options?: ExecuteOptions): Promise<ExecutionRecord> {
      const previousExecution = await storage.get(executionId);
      if (!previousExecution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      const workflow = await resolveWorkflow(previousExecution.workflowId);
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
      const seedOutputs: Array<{ stepId: string; outputVar?: string; output: unknown[]; exitCode?: number }> = [];
      for (const stepRecord of preservedSteps) {
        if (stepRecord.status === 'COMPLETED' && (stepRecord.output || stepRecord.exitCode !== undefined)) {
          const workflowStep = sortedWorkflowSteps.find(step => step.id === stepRecord.stepId);
          const outputVar = workflowStep?.outputVar;
          const output = stepRecord.output || [];
          if (outputVar) {
            initialVariables[outputVar] = output;
          }
          initialVariables[stepRecord.stepId] = output;
          seedOutputs.push({
            stepId: stepRecord.stepId,
            outputVar,
            output,
            exitCode: stepRecord.exitCode,
          });
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
        sessionId: options?.sessionId,
        auditHelper,
        environment,
      });
    },
  };
}
