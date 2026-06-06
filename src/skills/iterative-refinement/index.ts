export * from './types.js';
export { createFiveWhysAnalyzer } from './5whys-analyzer.js';
export type { FiveWhysAnalyzer } from './5whys-analyzer.js';
export { createRetryManager } from './retry-manager.js';
export type { RetryManager } from './retry-manager.js';

import { createRetryManager } from './retry-manager.js';
import { createFiveWhysAnalyzer } from './5whys-analyzer.js';
import type {
  RetryConfig,
  RefinementCallbacks,
  RefinementResult,
} from './types.js';

/**
 * Creates an Iterative Refinement skill
 * @param config - Partial retry configuration
 * @returns IterativeRefinementSkill instance
 */
export function createIterativeRefinementSkill(config?: Partial<RetryConfig>) {
  const retryManager = createRetryManager(config);
  const analyzer = createFiveWhysAnalyzer();

  /**
   * Executes a task with retry and refinement
   * @param taskFn - The task function to execute
   * @param options - Execution options including task ID and callbacks
   * @returns RefinementResult with optional task result
   */
  async function execute<T>(
    taskFn: () => Promise<T>,
    options?: {
      taskId?: string;
      callbacks?: RefinementCallbacks;
    }
  ): Promise<RefinementResult & { result?: T }> {
    return retryManager.executeWithRetry(taskFn, options);
  }

  /**
   * Analyzes an error using the 5 Whys method
   * @param taskId - The task identifier
   * @param error - The error message to analyze
   * @returns Analysis result
   */
  function analyzeError(taskId: string, error: string) {
    return analyzer.analyze(taskId, error);
  }

  /**
   * Formats the error analysis for display
   * @param analysis - The analysis result from analyzeError
   * @returns Formatted analysis string
   */
  function formatAnalysis(analysis: ReturnType<typeof analyzeError>) {
    return analyzer.formatAnalysis(analysis);
  }

  return {
    execute,
    analyzeError,
    formatAnalysis,
    getConfig: retryManager.getConfig,
  };
}

export type IterativeRefinementSkill = ReturnType<
  typeof createIterativeRefinementSkill
>;
