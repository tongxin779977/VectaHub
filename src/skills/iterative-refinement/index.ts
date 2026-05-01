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

export function createIterativeRefinementSkill(config?: Partial<RetryConfig>) {
  const retryManager = createRetryManager(config);
  const analyzer = createFiveWhysAnalyzer();

  async function execute<T>(
    taskFn: () => Promise<T>,
    options?: {
      taskId?: string;
      callbacks?: RefinementCallbacks;
    }
  ): Promise<RefinementResult & { result?: T }> {
    return retryManager.executeWithRetry(taskFn, options);
  }

  function analyzeError(taskId: string, error: string) {
    return analyzer.analyze(taskId, error);
  }

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

export default createIterativeRefinementSkill;
