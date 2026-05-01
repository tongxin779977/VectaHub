import { createFiveWhysAnalyzer } from './5whys-analyzer.js';
import type {
  RetryConfig,
  RetryContext,
  AttemptRecord,
  RefinementResult,
  RefinementCallbacks,
  FiveWhysAnalysis,
} from './types.js';

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialBackoff: 1000,
  backoffMultiplier: 2,
  maxBackoff: 30000,
  triggerAnalysisAfter: 2,
  enableAutoFix: true,
};

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRetryManager(customConfig?: Partial<RetryConfig>) {
  const config: RetryConfig = { ...DEFAULT_CONFIG, ...customConfig };
  const analyzer = createFiveWhysAnalyzer();

  async function executeWithRetry<T>(
    taskFn: () => Promise<T>,
    options?: {
      taskId?: string;
      callbacks?: RefinementCallbacks;
    }
  ): Promise<RefinementResult & { result?: T }> {
    const taskId = options?.taskId || generateTaskId();
    const callbacks = options?.callbacks || {};
    const startTime = Date.now();
    const attempts: AttemptRecord[] = [];
    const appliedFixes: string[] = [];
    let lastAnalysis: FiveWhysAnalysis | undefined;
    let lastError: string | undefined;
    let backoffDelay = config.initialBackoff;
    let hasAnalyzed = false;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      const attemptStartTime = Date.now();
      const context: RetryContext = {
        taskId,
        attemptCount: attempt,
        maxAttempts: config.maxAttempts,
        lastError,
        lastAnalysis,
        previousAttempts: [...attempts],
        backoffDelay,
        startedAt: new Date(startTime),
      };

      callbacks.onAttempt?.(attempt, context);

      try {
        const result = await taskFn();

        const attemptRecord: AttemptRecord = {
          attempt,
          status: 'SUCCESS',
          duration: Date.now() - attemptStartTime,
          timestamp: new Date(),
        };
        attempts.push(attemptRecord);

        const finalResult: RefinementResult & { result?: T } = {
          success: true,
          totalAttempts: attempt,
          analysis: lastAnalysis,
          appliedFixes,
          duration: Date.now() - startTime,
          result,
        };

        callbacks.onSuccess?.(finalResult);
        return finalResult;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        const attemptRecord: AttemptRecord = {
          attempt,
          status: 'FAILED',
          error: lastError,
          duration: Date.now() - attemptStartTime,
          timestamp: new Date(),
        };
        attempts.push(attemptRecord);

        if (attempt >= config.triggerAnalysisAfter && !hasAnalyzed) {
          hasAnalyzed = true;
          callbacks.onAnalysisStart?.(context);

          lastAnalysis = analyzer.analyze(taskId, lastError);
          callbacks.onAnalysisComplete?.(lastAnalysis);

          console.log(analyzer.formatAnalysis(lastAnalysis));

          if (config.enableAutoFix && lastAnalysis.rootCauses.length > 0) {
            const topCause = lastAnalysis.rootCauses[0];
            if (topCause.suggestedFixes.length > 0) {
              const fixToApply = topCause.suggestedFixes[0];
              appliedFixes.push(fixToApply);
              callbacks.onFixApplied?.(fixToApply, attempt);
              console.log(`\n[尝试修复] ${fixToApply}\n`);
            }
          }
        }

        if (attempt < config.maxAttempts) {
          console.log(
            `\n[重试] 第 ${attempt}/${config.maxAttempts} ` +
            `次失败，${(backoffDelay / 1000).toFixed(1)}秒后重试...\n`
          );
          await delay(backoffDelay);
          backoffDelay = Math.min(
            backoffDelay * config.backoffMultiplier,
            config.maxBackoff
          );
        }
      }
    }

    const finalResult: RefinementResult & { result?: T } = {
      success: false,
      totalAttempts: config.maxAttempts,
      finalError: lastError,
      analysis: lastAnalysis,
      appliedFixes,
      duration: Date.now() - startTime,
    };

    callbacks.onFailure?.(finalResult);
    return finalResult;
  }

  function getConfig(): Readonly<RetryConfig> {
    return { ...config };
  }

  return {
    executeWithRetry,
    getConfig,
  };
}

export type RetryManager = ReturnType<typeof createRetryManager>;
