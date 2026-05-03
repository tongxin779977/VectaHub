import { createExecutor, type ExecutorOptions, type ExecutionContext } from './executor.js';
import type { Step, StepRecord, SandboxMode } from '../types/index.js';

export interface ParallelExecutorOptions {
  maxWorkers?: number;
  mode?: SandboxMode;
}

export interface ParallelExecutionResult {
  success: boolean;
  results: StepRecord[];
}

export interface ParallelExecutor {
  execute(steps: Step[], options?: ExecutorOptions): Promise<ParallelExecutionResult>;
}

function buildDependencyGraph(steps: Step[]) {
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

  return { stepMap, inDegree, dependents };
}

export function createParallelExecutor(options: ParallelExecutorOptions = {}): ParallelExecutor {
  const maxWorkers = options.maxWorkers || 4;
  const defaultMode = options.mode || 'RELAXED';
  const executor = createExecutor();

  async function execute(
    steps: Step[],
    execOptions: ExecutorOptions = { mode: defaultMode }
  ): Promise<ParallelExecutionResult> {
    const { stepMap, inDegree, dependents } = buildDependencyGraph(steps);
    const results = new Map<string, StepRecord>();
    const context: ExecutionContext = { variables: {}, previousOutputs: {} };
    let failed = false;

    // 创建一个队列，用于跟踪可用的步骤
    const readyQueue: string[] = [];

    // 初始化就绪队列
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        readyQueue.push(id);
      }
    }

    const activeWorkers = new Set<string>();

    async function executeStep(stepId: string): Promise<void> {
      if (failed) return;

      activeWorkers.add(stepId);
      const step = stepMap.get(stepId)!;
      const startAt = new Date();

      try {
        const result = await executor.execute(step, execOptions, context);
        
        const stepRecord: StepRecord = {
          stepId: step.id,
          status: result.status,
          startAt,
          endAt: new Date(),
          output: result.output,
          error: result.error,
          iterations: result.iterations,
        };

        results.set(stepId, stepRecord);

        const storageKey = (step as any).outputVar || step.id;
        if (result.output) {
          context.previousOutputs[storageKey] = result.output;
        }

        if (result.status === 'FAILED') {
          failed = true;
        }
      } catch (error) {
        const stepRecord: StepRecord = {
          stepId: step.id,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
          startAt,
          endAt: new Date(),
        };
        results.set(stepId, stepRecord);
        failed = true;
      } finally {
        activeWorkers.delete(stepId);
      }
    }

    async function processQueue(): Promise<void> {
      while (!failed && (readyQueue.length > 0 || activeWorkers.size > 0)) {
        // 启动新的 worker
        while (!failed && readyQueue.length > 0 && activeWorkers.size < maxWorkers) {
          const stepId = readyQueue.shift()!;
          executeStep(stepId).then(() => {
            // 当步骤完成时，更新依赖
            const step = stepMap.get(stepId);
            if (step && !failed) {
              const stepDeps = dependents.get(stepId) || [];
              for (const dependentId of stepDeps) {
                const newDegree = (inDegree.get(dependentId) || 1) - 1;
                inDegree.set(dependentId, newDegree);
                if (newDegree === 0) {
                  readyQueue.push(dependentId);
                }
              }
            }
          });
        }

        // 等待任何活动的 worker 完成
        if (activeWorkers.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    await processQueue();

    return {
      success: !failed,
      results: Array.from(results.values()),
    };
  }

  return {
    execute,
  };
}
