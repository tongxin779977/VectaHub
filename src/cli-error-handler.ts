/**
 * CLI Error Handler with recovery mechanisms.
 * Provides retry logic, error classification, and graceful degradation.
 */

import type { InfrastructureContext } from './infrastructure/context.js';
import { createCliOutput, isCliOutputHandledError } from './infrastructure/cli-output.js';
import { formatErrorMessage, toJSONError } from './infrastructure/errors/index.js';
import { AsyncLogWriter } from './infrastructure/trace-audit/async-writer.js';
import { isVerbose } from './utils/global-options.js';

/** Error severity levels for classification. */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Error classification result. */
export interface ErrorClassification {
  severity: ErrorSeverity;
  category: string;
  retryable: boolean;
  userMessage: string;
  technicalMessage: string;
}

/** Retry configuration. */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/** Default retry configuration. */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
};

/** Error recovery strategy. */
export type RecoveryStrategy = 'retry' | 'fallback' | 'skip' | 'abort';

/** Recovery action result. */
export interface RecoveryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  strategy: RecoveryStrategy;
  attempts: number;
}

/**
 * Classify an error by analyzing its type, message, and context.
 * @param error - The error to classify.
 * @returns Error classification with severity and retryability.
 */
export function classifyError(error: unknown): ErrorClassification {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'UnknownError';

  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('ENOTFOUND')) {
    return {
      severity: 'medium',
      category: 'network',
      retryable: true,
      userMessage: '网络连接失败，请检查网络设置',
      technicalMessage: message,
    };
  }

  if (message.includes('EPERM') || message.includes('EACCES') || message.includes('permission')) {
    return {
      severity: 'high',
      category: 'permission',
      retryable: false,
      userMessage: '权限不足，请检查文件或目录权限',
      technicalMessage: message,
    };
  }

  if (message.includes('ENOENT') || message.includes('not found') || message.includes('not exist')) {
    return {
      severity: 'medium',
      category: 'not-found',
      retryable: false,
      userMessage: '请求的资源不存在',
      technicalMessage: message,
    };
  }

  if (message.includes('ENOMEM') || message.includes('out of memory')) {
    return {
      severity: 'critical',
      category: 'resource',
      retryable: false,
      userMessage: '系统内存不足',
      technicalMessage: message,
    };
  }

  if (name === 'SyntaxError' || message.includes('JSON') || message.includes('parse')) {
    return {
      severity: 'medium',
      category: 'parsing',
      retryable: false,
      userMessage: '数据格式错误',
      technicalMessage: message,
    };
  }

  if (message.includes('timeout') || name === 'TimeoutError') {
    return {
      severity: 'medium',
      category: 'timeout',
      retryable: true,
      userMessage: '操作超时，请稍后重试',
      technicalMessage: message,
    };
  }

  return {
    severity: 'medium',
    category: 'unknown',
    retryable: false,
    userMessage: '发生未知错误',
    technicalMessage: message,
  };
}

/**
 * Execute an async operation with retry logic and exponential backoff.
 * @param operation - The async operation to execute.
 * @param config - Retry configuration.
 * @param context - Description for logging.
 * @param ctx - Optional infrastructure context for logging.
 * @returns Recovery result with success status and attempts count.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string,
  ctx?: InfrastructureContext,
): Promise<RecoveryResult<T>> {
  let lastError: unknown;
  const maxAttempts = config.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      return {
        success: true,
        result,
        strategy: 'retry',
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;

      const classification = classifyError(error);

      if (!classification.retryable || attempt >= maxAttempts) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          strategy: 'abort',
          attempts: attempt,
        };
      }

      const delay = Math.min(
        config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs,
      );

      if (ctx) {
        ctx.logger.getLogger('cli-error-handler').debug(
          { attempt, delay, context, error: classification.technicalMessage },
          'Retrying operation after transient failure',
        );
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError instanceof Error ? lastError : new Error(String(lastError)),
    strategy: 'abort',
    attempts: maxAttempts,
  };
}

/**
 * Execute an operation with fallback strategy.
 * Tries the primary operation first, then falls back to the fallback if it fails.
 * @param primary - The primary operation to try.
 * @param fallback - The fallback operation if primary fails.
 * @param context - Description for logging.
 * @returns Recovery result.
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  context?: string,
): Promise<RecoveryResult<T>> {
  try {
    const result = await primary();
    return {
      success: true,
      result,
      strategy: 'retry',
      attempts: 1,
    };
  } catch (primaryError) {
    try {
      const result = await fallback();
      return {
        success: true,
        result,
        strategy: 'fallback',
        attempts: 2,
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
        strategy: 'abort',
        attempts: 2,
      };
    }
  }
}

/**
 * Handle CLI errors with appropriate output and exit behavior.
 * Supports JSON and text output modes, verbose error details, and audit log flushing.
 * @param error - The error to handle.
 * @param ctx - The infrastructure context.
 * @returns Never returns; always exits the process.
 */
export async function handleCliError(error: unknown, ctx: InfrastructureContext): Promise<never> {
  const isJson = ctx.environment.getArgv().includes('--json');
  const output = createCliOutput({ json: isJson });

  try {
    await AsyncLogWriter.flushAll();
  } catch (flushError) {
    ctx.logger.getLogger('cli-error-handler').warn({ error: flushError }, 'Failed to flush audit logs');
  }

  if (isCliOutputHandledError(error)) {
    ctx.environment.exit(1);
    throw new Error('Should not reach here');
  }

  const classification = classifyError(error);

  if (isJson) {
    output.json({
      ...toJSONError(error, isVerbose()),
      classification: {
        severity: classification.severity,
        category: classification.category,
        retryable: classification.retryable,
      },
    }, { space: 2 });
  } else {
    output.error(`\n❌ ${classification.userMessage}`);
    if (isVerbose()) {
      output.error(`   技术详情: ${classification.technicalMessage}`);
      if (error instanceof Error && error.stack) {
        output.error(error.stack);
      }
    }
  }

  ctx.environment.exit(1);
  throw new Error('Should not reach here');
}

/**
 * Create a retry wrapper with pre-configured settings.
 * @param config - Retry configuration.
 * @param ctx - Optional infrastructure context for logging.
 * @returns A function that wraps operations with retry logic.
 */
export function createRetryWrapper(config: Partial<RetryConfig> = {}, ctx?: InfrastructureContext) {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  return async <T>(operation: () => Promise<T>, context?: string): Promise<RecoveryResult<T>> => {
    return withRetry(operation, fullConfig, context, ctx);
  };
}
