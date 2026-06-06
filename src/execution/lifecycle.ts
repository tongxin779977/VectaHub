import type { ExecutionRecord } from '../types/index.js';
import type { WorkflowEngine, ExecuteOptions } from '../workflow/engine.js';
import type { RecordManager } from './record-manager.js';

export interface LifecycleManager {
  rerun(executionId: string, options?: RerunOptions): Promise<ExecutionRecord>;
  resume(executionId: string, options?: ResumeOptions): Promise<ExecutionRecord>;
  resumeFromStep(executionId: string, stepIndex: number, options?: ExecuteOptions): Promise<ExecutionRecord>;
}

export interface RerunOptions {
  reuseContext?: boolean;
  mode?: 'strict' | 'relaxed' | 'consensus';
}

export interface ResumeOptions {
  fromStep?: number;
  mode?: 'strict' | 'relaxed' | 'consensus';
}

/**
 * Creates a lifecycle manager that coordinates rerun and resume operations.
 *
 * Delegates to the workflow engine for actual execution while managing
 * execution record lookup and failure-point detection.
 *
 * @param options - Engine and record manager dependencies
 * @returns A {@link LifecycleManager} instance
 */
export function createLifecycleManager(options: {
  engine: WorkflowEngine;
  recordManager: RecordManager;
}): LifecycleManager {
  const { engine, recordManager } = options;

  return {
    async rerun(executionId: string, rerunOptions?: RerunOptions): Promise<ExecutionRecord> {
      const previousRecord = await recordManager.get(executionId);
      if (!previousRecord) {
        throw new Error(`Execution ${executionId} not found`);
      }

      const workflow = await engine.getWorkflow(previousRecord.workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${previousRecord.workflowId} not found`);
      }

      return engine.execute(workflow, {
        mode: rerunOptions?.mode,
      });
    },

    async resume(executionId: string, resumeOptions?: ResumeOptions): Promise<ExecutionRecord> {
      return this.resumeFromStep(executionId, resumeOptions?.fromStep ?? -1, {
        mode: resumeOptions?.mode,
      });
    },

    async resumeFromStep(executionId: string, stepIndex: number, execOptions?: ExecuteOptions): Promise<ExecutionRecord> {
      const previousRecord = await recordManager.get(executionId);
      if (!previousRecord) {
        throw new Error(`Execution ${executionId} not found`);
      }

      let targetStep = stepIndex;
      if (targetStep < 0) {
        const failedIdx = previousRecord.steps.findIndex((s) => s.status === 'FAILED');
        if (failedIdx === -1) {
          throw new Error(`No failed step found in execution ${executionId}`);
        }
        targetStep = failedIdx;
      }

      return engine.resumeFromFailure(executionId, targetStep, execOptions);
    },
  };
}
