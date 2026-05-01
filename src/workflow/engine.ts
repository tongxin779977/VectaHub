import type { Workflow, Step, StepType, ExecutionRecord, StepRecord, ExecutionStatus } from '../types/index.js';
import { createExecutor, type Executor, type ExecutorOptions } from './executor.js';

export interface ExecuteOptions {
  dryRun?: boolean;
  timeout?: number;
  mode?: 'strict' | 'relaxed' | 'consensus';
}

export interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[]): Workflow;
  addStep(workflowId: string, step: Step): void;
  removeStep(workflowId: string, stepId: string): void;
  getWorkflow(id: string): Workflow | undefined;
  listWorkflows(): Workflow[];
  execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;
  pause(): void;
  resume(): void;
  abort(): void;
  getStatus(): ExecutionRecord | undefined;
}

let workflowCounter = 0;
let executionCounter = 0;

export function createWorkflowEngine(): WorkflowEngine {
  const workflows = new Map<string, Workflow>();
  const executor = createExecutor();

  let currentExecution: ExecutionRecord | undefined;
  let isPaused = false;
  let isAborted = false;

  return {
    createWorkflow(name: string, steps: Step[]): Workflow {
      const workflow: Workflow = {
        id: `wf_${++workflowCounter}`,
        name,
        mode: 'relaxed',
        steps,
        createdAt: new Date(),
      };
      workflows.set(workflow.id, workflow);
      return workflow;
    },

    addStep(workflowId: string, step: Step): void {
      const wf = workflows.get(workflowId);
      if (wf) {
        wf.steps.push(step);
      }
    },

    removeStep(workflowId: string, stepId: string): void {
      const wf = workflows.get(workflowId);
      if (wf) {
        wf.steps = wf.steps.filter((s) => s.id !== stepId);
      }
    },

    getWorkflow(id: string): Workflow | undefined {
      return workflows.get(id);
    },

    listWorkflows(): Workflow[] {
      return Array.from(workflows.values());
    },

    async execute(workflow: Workflow, options: ExecuteOptions = {}): Promise<ExecutionRecord> {
      isPaused = false;
      isAborted = false;

      const executionId = `exec_${++executionCounter}`;
      const startedAt = new Date();

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

      const executorOptions: ExecutorOptions = {
        mode: workflow.mode === 'strict' ? 'STRICT' : workflow.mode === 'consensus' ? 'CONSENSUS' : 'RELAXED',
        dryRun: options.dryRun,
        timeout: options.timeout || 30000,
      };

      for (const step of workflow.steps) {
        if (isAborted) {
          currentExecution.status = 'FAILED';
          break;
        }

        while (isPaused && !isAborted) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const result = await executor.execute(step, executorOptions);

        const stepRecord: StepRecord = {
          stepId: step.id,
          status: result.status as ExecutionStatus,
          output: result.output,
          error: result.error,
        };

        currentExecution.steps.push(stepRecord);

        if (result.status === 'FAILED') {
          currentExecution.status = 'FAILED';
          break;
        }
      }

      if (!isAborted && currentExecution.status !== 'FAILED') {
        currentExecution.status = 'COMPLETED';
      }

      currentExecution.endedAt = new Date();
      currentExecution.duration = currentExecution.endedAt.getTime() - startedAt.getTime();

      return currentExecution;
    },

    pause(): void {
      if (currentExecution && currentExecution.status === 'RUNNING') {
        isPaused = true;
        currentExecution.status = 'PAUSED';
      }
    },

    resume(): void {
      if (currentExecution && currentExecution.status === 'PAUSED') {
        isPaused = false;
        currentExecution.status = 'RUNNING';
      }
    },

    abort(): void {
      isAborted = true;
      if (currentExecution) {
        currentExecution.status = 'FAILED';
        currentExecution.endedAt = new Date();
      }
    },

    getStatus(): ExecutionRecord | undefined {
      return currentExecution;
    },
  };
}