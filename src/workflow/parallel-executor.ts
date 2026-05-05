import { createExecutor, type ExecutorOptions } from './executor.js';
import { createContextManager, type ContextManager } from './context-manager.js';
import { buildDependencyGraph, getReadyNodes, updateDependency, type DependencyGraph } from './dag.js';
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

export function createParallelExecutor(options: ParallelExecutorOptions = {}): ParallelExecutor {
  const maxWorkers = options.maxWorkers || 4;
  const defaultMode = options.mode || 'RELAXED';
  const executor = createExecutor();
  const contextManager = createContextManager();
  let executionId: string | null = null;
  let sessionIdCounter = 0;

  async function execute(
    steps: Step[],
    execOptions: ExecutorOptions = { mode: defaultMode }
  ): Promise<ParallelExecutionResult> {
    const graph = buildDependencyGraph(steps);
    const results = new Map<string, StepRecord>();
    
    executionId = `parallel_exec_${++sessionIdCounter}`;
    contextManager.createContext('parallel_wf', executionId, 'parallel_session');
    
    let failed = false;

    const readyQueue: string[] = getReadyNodes(graph);
    const activeWorkers = new Set<string>();

    async function executeStep(stepId: string): Promise<void> {
      if (failed) return;

      activeWorkers.add(stepId);
      const step = graph.nodeMap.get(stepId)!;
      const startAt = new Date();

      try {
        const executorContext = contextManager.toExecutorContext(executionId!);
        const result = await executor.execute(step, execOptions, executorContext);
        
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

        const storageKey = (step as unknown as Record<string, unknown>).outputVar as string || step.id;
        if (result.output) {
          contextManager.setStepOutput(executionId!, storageKey, result.output, {
            stdout: result.output.join('\n'),
          });
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
        while (!failed && readyQueue.length > 0 && activeWorkers.size < maxWorkers) {
          const stepId = readyQueue.shift()!;
          executeStep(stepId).then(() => {
            if (!failed) {
              const newlyReady = updateDependency(graph, stepId);
              readyQueue.push(...newlyReady);
            }
          });
        }

        if (activeWorkers.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    await processQueue();
    
    contextManager.deleteContext(executionId);
    executionId = null;

    return {
      success: !failed,
      results: Array.from(results.values()),
    };
  }

  return {
    execute,
  };
}
