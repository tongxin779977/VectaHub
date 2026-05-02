import type { Workflow, Step, ExecutionRecord, StepRecord, ExecutionStatus } from '../types/index.js';
import { createExecutor, type Executor, type ExecutorOptions, type ExecutionContext } from './executor.js';
import { createStorage, type Storage } from './storage.js';
import { audit } from '../utils/audit.js';

export interface ExecuteOptions {
  dryRun?: boolean;
  timeout?: number;
  mode?: 'strict' | 'relaxed' | 'consensus';
}

export interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[]): Promise<Workflow>;
  addStep(workflowId: string, step: Step): Promise<void>;
  removeStep(workflowId: string, stepId: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;
  executeAsync(workflow: Workflow, options?: ExecuteOptions): void;
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  getStatus(): ExecutionRecord | undefined;
  waitForCompletion(): Promise<ExecutionRecord>;
  loadWorkflows(): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | undefined>;
  resumeFromFailure(executionId: string, options?: ExecuteOptions): Promise<ExecutionRecord>;
}

type ExecutionState = string;

let workflowCounter = 0;
let executionCounter = 0;

function topologicalSort(steps: Step[]): Step[] {
  const stepMap = new Map<string, Step>();
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    stepMap.set(step.id, step);
    inDegree.set(step.id, 0);
    dependents.set(step.id, []);
  }

  for (const step of steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        if (stepMap.has(depId)) {
          inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
          dependents.get(depId)?.push(step.id);
        }
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: Step[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const step = stepMap.get(id)!;
    sorted.push(step);

    for (const dependentId of dependents.get(id) || []) {
      const newDegree = (inDegree.get(dependentId) || 1) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (sorted.length !== steps.length) {
    const remaining = steps.filter(s => !sorted.includes(s));
    return [...sorted, ...remaining];
  }

  return sorted;
}

function interpolateStep(step: Step, context: ExecutionContext): Step {
  const resolveVariable = (value: string): string => {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      if (context.previousOutputs[varName]) {
        const output = context.previousOutputs[varName];
        return Array.isArray(output) ? output.join('\n') : String(output);
      }
      if (context.variables[varName]) {
        return String(context.variables[varName]);
      }
      return `\${${varName}}`;
    });
  };

  return {
    ...step,
    cli: step.cli ? resolveVariable(step.cli) : undefined,
    args: step.args?.map(arg => resolveVariable(arg)),
  };
}

export function createWorkflowEngine(): WorkflowEngine {
  const workflows = new Map<string, Workflow>();
  const executor = createExecutor();
  const storage = createStorage();

  let currentExecution: ExecutionRecord | undefined;
  let executionState: ExecutionState = 'IDLE';
  let pauseResolver: (() => void) | null = null;
  let completionPromise: Promise<ExecutionRecord> | null = null;
  let completionResolver: ((record: ExecutionRecord) => void) | null = null;
  let currentStepIndex = 0;

  function setState(newState: ExecutionState): void {
    executionState = newState;
    if (currentExecution) {
      switch (newState) {
        case 'RUNNING':
          currentExecution.status = 'RUNNING';
          break;
        case 'PAUSED':
          currentExecution.status = 'PAUSED';
          break;
        case 'COMPLETED':
          currentExecution.status = 'COMPLETED';
          break;
        case 'FAILED':
        case 'ABORTED':
          currentExecution.status = 'FAILED';
          break;
      }
    }
  }

  async function executeWorkflowInternal(
    workflow: Workflow,
    options: ExecuteOptions = {}
  ): Promise<ExecutionRecord> {
    const executionId = `exec_${++executionCounter}`;
    const startedAt = new Date();
    currentStepIndex = 0;

    currentExecution = {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'RUNNING',
      mode: workflow.mode,
      startedAt,
      steps: [],
      warnings: [],
      logs: [],
    };

    setState('RUNNING');

    const sessionId = 'unknown';
    audit.workflowStart(workflow.id, workflow.name, sessionId, {
      stepCount: workflow.steps.length,
      mode: workflow.mode,
    });

    const executorOptions: ExecutorOptions = {
      mode: workflow.mode === 'strict' ? 'STRICT' : workflow.mode === 'consensus' ? 'CONSENSUS' : 'RELAXED',
      dryRun: options.dryRun,
      timeout: options.timeout || 30000,
    };

    const sortedSteps = topologicalSort(workflow.steps);
    const context: ExecutionContext = { variables: {}, previousOutputs: {} };

    for (let i = 0; i < sortedSteps.length; i++) {
      currentStepIndex = i;
      const step = sortedSteps[i];

      if (executionState === 'ABORTING' || executionState === 'ABORTED') {
        currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
        break;
      }

      let shouldContinuePausing = executionState === 'PAUSED';
      let loopAborted = false;
      while (shouldContinuePausing) {
        await new Promise<void>((resolve) => {
          pauseResolver = resolve;
        });
        pauseResolver = null;

        if (executionState === 'ABORTING' || executionState === 'ABORTED') {
          currentExecution.warnings.push(`Workflow aborted at step ${i + 1}`);
          loopAborted = true;
          break;
        }
        shouldContinuePausing = executionState === 'PAUSED';
      }

      if (loopAborted) {
        break;
      }

      try {
        const interpolatedStep = interpolateStep(step, context);
        const result = await executor.execute(interpolatedStep, executorOptions, context);

        const stepRecord: StepRecord = {
          stepId: step.id,
          status: result.status as ExecutionStatus,
          startAt: new Date(startedAt.getTime() + (result.duration || 0)),
          endAt: new Date(),
          output: result.output,
          error: result.error,
          iterations: result.iterations,
        };

        currentExecution.steps.push(stepRecord);

        audit.workflowStep(
          step.id,
          step.cli || '',
          step.args || [],
          sessionId,
          { status: result.status, iterations: result.iterations }
        );

        const storageKey = (step as any).outputVar || step.id;
        if (result.output) {
          context.previousOutputs[storageKey] = result.output;
        }

        if (result.status === 'FAILED') {
          setState('FAILED');
          currentExecution.warnings.push(`Step ${i + 1} failed: ${result.error}`);
          break;
        }
      } catch (error) {
        const stepRecord: StepRecord = {
          stepId: step.id,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        };
        currentExecution.steps.push(stepRecord);
        setState('FAILED');
        break;
      }
    }

    if (executionState === 'RUNNING') {
      setState('COMPLETED');
    }

    currentExecution.endedAt = new Date();
    currentExecution.duration = currentExecution.endedAt.getTime() - startedAt.getTime();

    await storage.save(currentExecution);

    audit.workflowEnd(
      workflow.id,
      currentExecution.status,
      currentExecution.duration || 0,
      sessionId
    );

    if (completionResolver) {
      completionResolver(currentExecution);
      completionResolver = null;
      completionPromise = null;
    }

    return currentExecution;
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

    async execute(workflow: Workflow, options: ExecuteOptions = {}): Promise<ExecutionRecord> {
      return executeWorkflowInternal(workflow, options);
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
      completionPromise = new Promise((resolve) => {
        completionResolver = resolve;
      });
      executeWorkflowInternal(workflow, options).then((record) => {
        if (completionResolver) {
          completionResolver(record);
        }
      });
    },

    pause(): boolean {
      if (executionState !== 'RUNNING') {
        return false;
      }

      setState('PAUSING');

      if (currentExecution) {
        currentExecution.status = 'PAUSED';
      }

      executor.killCurrentProcess();

      setState('PAUSED');
      return true;
    },

    resume(): boolean {
      if (executionState !== 'PAUSED') {
        return false;
      }

      setState('RUNNING');

      if (pauseResolver) {
        pauseResolver();
      }

      return true;
    },

    abort(): boolean {
      if (executionState !== 'RUNNING' && executionState !== 'PAUSED' && executionState !== 'PAUSING') {
        return false;
      }

      setState('ABORTING');

      executor.killCurrentProcess();

      if (pauseResolver) {
        pauseResolver();
      }

      if (currentExecution) {
        currentExecution.status = 'FAILED';
        currentExecution.endedAt = new Date();
      }

      setState('ABORTED');
      return true;
    },

    getStatus(): ExecutionRecord | undefined {
      return currentExecution;
    },

    waitForCompletion(): Promise<ExecutionRecord> {
      if (executionState === 'IDLE' || executionState === 'COMPLETED' || executionState === 'FAILED' || executionState === 'ABORTED') {
        if (currentExecution) {
          return Promise.resolve(currentExecution);
        }
        return Promise.reject(new Error('No execution in progress'));
      }

      if (!completionPromise) {
        completionPromise = new Promise((resolve) => {
          completionResolver = resolve;
        });
      }

      return completionPromise;
    },

    async getExecution(id: string): Promise<ExecutionRecord | undefined> {
      return storage.get(id);
    },

    async resumeFromFailure(executionId: string, options?: ExecuteOptions): Promise<ExecutionRecord> {
      const previousExecution = await storage.get(executionId);
      if (!previousExecution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      const workflow = await this.getWorkflow(previousExecution.workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${previousExecution.workflowId} not found`);
      }

      const failedStepIndex = previousExecution.steps.findIndex(
        s => s.status === 'FAILED'
      );

      if (failedStepIndex === -1) {
        throw new Error(`No failed step found in execution ${executionId}`);
      }

      const remainingSteps = workflow.steps.slice(failedStepIndex + 1);
      if (remainingSteps.length === 0) {
        throw new Error(`No remaining steps to execute after step ${failedStepIndex + 1}`);
      }

      const newExecutionId = `exec_${++executionCounter}`;
      const context: ExecutionContext = { variables: {}, previousOutputs: {} };
      for (const stepRecord of previousExecution.steps) {
        if (stepRecord.output) {
          context.previousOutputs[stepRecord.stepId] = stepRecord.output.map(String);
        }
      }

      const startedAt = new Date();

      currentExecution = {
        executionId: newExecutionId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: 'RUNNING',
        mode: workflow.mode,
        startedAt,
        steps: [...previousExecution.steps],
        warnings: [...previousExecution.warnings],
        logs: [],
      };

      setState('RUNNING');

      const sessionId = 'unknown';
      audit.workflowStart(workflow.id, workflow.name, sessionId, {
        stepCount: remainingSteps.length,
        mode: workflow.mode,
        resumedFrom: executionId,
      });

      const executorOptions: ExecutorOptions = {
        mode: workflow.mode === 'strict' ? 'STRICT' : workflow.mode === 'consensus' ? 'CONSENSUS' : 'RELAXED',
        dryRun: options?.dryRun,
        timeout: options?.timeout || 30000,
      };

      const sortedSteps = topologicalSort(remainingSteps);

      for (let i = 0; i < sortedSteps.length; i++) {
        const stepIndex = failedStepIndex + 1 + i;
        const step = sortedSteps[i];

        if (executionState === 'ABORTING' || executionState === 'ABORTED') {
          currentExecution.warnings.push(`Workflow aborted at step ${stepIndex + 1}`);
          break;
        }

        try {
          const interpolatedStep = interpolateStep(step, context);
          const result = await executor.execute(interpolatedStep, executorOptions, context);

          const stepRecord: StepRecord = {
            stepId: step.id,
            status: result.status as ExecutionStatus,
            startAt: new Date(startedAt.getTime() + (result.duration || 0)),
            endAt: new Date(),
            output: result.output,
            error: result.error,
            iterations: result.iterations,
          };

          currentExecution.steps.push(stepRecord);

          audit.workflowStep(
            step.id,
            step.cli || '',
            step.args || [],
            sessionId,
            { status: result.status, iterations: result.iterations, resumedFrom: executionId }
          );

          const storageKey = (step as any).outputVar || step.id;
          if (result.output) {
            context.previousOutputs[storageKey] = result.output;
          }

          if (result.status === 'FAILED') {
            setState('FAILED');
            currentExecution.warnings.push(`Step ${stepIndex + 1} failed: ${result.error}`);
            break;
          }
        } catch (error) {
          const stepRecord: StepRecord = {
            stepId: step.id,
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
          };
          currentExecution.steps.push(stepRecord);
          setState('FAILED');
          break;
        }
      }

      if (executionState === 'RUNNING') {
        setState('COMPLETED');
      }

      currentExecution.endedAt = new Date();
      currentExecution.duration = currentExecution.endedAt.getTime() - startedAt.getTime();

      await storage.save(currentExecution);

      audit.workflowEnd(
        workflow.id,
        currentExecution.status,
        currentExecution.duration || 0,
        sessionId
      );

      if (completionResolver) {
        completionResolver(currentExecution);
        completionResolver = null;
        completionPromise = null;
      }

      return currentExecution;
    },
  };
}
