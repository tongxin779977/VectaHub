import { Skill, SkillContext, SkillResult, CompositeSkill, SkillSandboxConfig } from './types.js';

type LoggerType = { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; info?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };

/**
 * Options for creating a SkillExecutor
 * @property maxRetries - Maximum number of retry attempts (default: 3)
 * @property timeout - Execution timeout in milliseconds (default: 120000)
 * @property logger - Logger instance for debug and warning messages
 * @property sandbox - Optional sandbox configuration for isolated execution
 */
export interface SkillExecutorOptions {
  maxRetries?: number;
  timeout?: number;
  logger: LoggerType;
  sandbox?: Partial<SkillSandboxConfig>;
}

interface ResolvedSkillExecutorOptions {
  maxRetries: number;
  timeout: number;
}

/**
 * Execution metrics for tracking skill performance
 * @property totalExecutions - Total number of executions
 * @property successfulExecutions - Number of successful executions
 * @property failedExecutions - Number of failed executions
 * @property averageExecutionTime - Average execution time in milliseconds
 * @property sandboxedExecutions - Number of sandboxed executions
 */
export interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  sandboxedExecutions: number;
}

/**
 * SkillExecutor handles the execution of skills with retry logic, timeout, and sandboxing
 * Provides both single skill and composite skill execution capabilities
 */
export class SkillExecutor {
  private options: ResolvedSkillExecutorOptions;
  private readonly logger: LoggerType;
  private readonly sandboxConfig: SkillSandboxConfig;
  private metrics: ExecutionMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    sandboxedExecutions: 0
  };

  /**
   * Creates a new SkillExecutor instance
   * @param options - Configuration options for the executor
   */
  constructor(options: SkillExecutorOptions) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      timeout: options.timeout ?? 120000
    };
    this.logger = options.logger;
    this.sandboxConfig = {
      enabled: options.sandbox?.enabled ?? false,
      timeout: options.sandbox?.timeout ?? this.options.timeout,
      memoryLimit: options.sandbox?.memoryLimit ?? 512 * 1024 * 1024,
      allowedModules: options.sandbox?.allowedModules ?? [],
      blockedModules: options.sandbox?.blockedModules ?? ['child_process', 'fs', 'net']
    };
  }

  /**
   * Executes a skill with retry logic and optional sandboxing
   * @template TInput - The input type
   * @template TOutput - The output type
   * @param skill - The skill to execute
   * @param input - The input data
   * @param context - The execution context
   * @returns Promise resolving to the skill result
   */
  async execute<TInput = unknown, TOutput = unknown>(
    skill: Skill<TInput, TOutput>,
    input: TInput,
    context: SkillContext
  ): Promise<SkillResult<TOutput>> {
    const startTime = Date.now();
    let retries = 0;
    let lastError: Error | null = null;

    this.metrics.totalExecutions++;

    while (retries <= this.options.maxRetries!) {
      try {
        this.logger.debug(`Executing skill: ${skill.name} (v${skill.version})`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Skill execution timeout after ${this.options.timeout}ms`)), this.options.timeout);
        });

        let result: SkillResult<TOutput>;

        if (this.sandboxConfig.enabled) {
          result = await this.executeInSandbox(skill, input, context, timeoutPromise);
          this.metrics.sandboxedExecutions++;
        } else {
          result = await Promise.race([
            skill.execute(input, context),
            timeoutPromise
          ]);
        }

        const executionTime = Date.now() - startTime;
        this.updateMetrics(executionTime, true);

        this.logger.debug(`Skill ${skill.name} executed successfully: ${result.success}, confidence: ${result.confidence}`);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Skill ${skill.name} failed (retry ${retries + 1}/${this.options.maxRetries}):`, lastError.message);
        retries++;

        if (retries <= this.options.maxRetries!) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
        }
      }
    }

    const executionTime = Date.now() - startTime;
    this.updateMetrics(executionTime, false);

    return {
      success: false,
      error: `Skill ${skill.name} failed after ${this.options.maxRetries} retries: ${lastError?.message}`,
      confidence: 0
    };
  }

  /**
   * Executes a composite skill using its defined strategy
   * @template TInput - The input type
   * @template TOutput - The output type
   * @param compositeSkill - The composite skill to execute
   * @param input - The input data
   * @param context - The execution context
   * @returns Promise resolving to the skill result
   */
  async executeComposite<TInput = unknown, TOutput = unknown>(
    compositeSkill: CompositeSkill,
    input: TInput,
    context: SkillContext
  ): Promise<SkillResult<TOutput>> {
    switch (compositeSkill.strategy) {
      case 'sequential':
        return this.executeSequential(compositeSkill, input, context);
      case 'parallel':
        return this.executeParallel(compositeSkill, input, context);
      case 'conditional':
        return this.executeConditional(compositeSkill, input, context);
      default:
        return {
          success: false,
          error: `Unknown composite strategy: ${(compositeSkill as CompositeSkill).strategy}`,
          confidence: 0
        };
    }
  }

  /**
   * Gets the current execution metrics
   * @returns ExecutionMetrics object
   */
  getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  /**
   * Resets the execution metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      sandboxedExecutions: 0
    };
  }

  /**
   * Executes a skill in a sandboxed environment
   * @template TInput - The input type
   * @template TOutput - The output type
   * @param skill - The skill to execute
   * @param input - The input data
   * @param context - The execution context
   * @param timeoutPromise - Timeout promise for execution
   * @returns Promise resolving to the skill result
   * @private
   */
  private async executeInSandbox<TInput = unknown, TOutput = unknown>(
    skill: Skill<TInput, TOutput>,
    input: TInput,
    context: SkillContext,
    timeoutPromise: Promise<never>
  ): Promise<SkillResult<TOutput>> {
    const originalProcess = globalThis.process;
    const originalRequire = (globalThis as Record<string, unknown>).require;

    try {
      if (this.sandboxConfig.blockedModules.length > 0) {
        const blockedModules = this.sandboxConfig.blockedModules;
        (globalThis as Record<string, unknown>).require = (module: string) => {
          if (blockedModules.includes(module)) {
            throw new Error(`Module '${module}' is blocked in sandbox mode`);
          }
          if (originalRequire) {
            return (originalRequire as (m: string) => unknown)(module);
          }
          throw new Error(`Cannot require module '${module}': require is not available`);
        };
      }

      const result = await Promise.race([
        skill.execute(input, context),
        timeoutPromise
      ]);

      return result;
    } finally {
      (globalThis as Record<string, unknown>).require = originalRequire;
      globalThis.process = originalProcess;
    }
  }

  /**
   * Executes skills sequentially
   * @template TInput - The input type
   * @template TOutput - The output type
   * @param compositeSkill - The composite skill
   * @param input - The input data
   * @param context - The execution context
   * @returns Promise resolving to the skill result
   * @private
   */
  private async executeSequential<TInput = unknown, TOutput = unknown>(
    compositeSkill: CompositeSkill,
    input: TInput,
    context: SkillContext
  ): Promise<SkillResult<TOutput>> {
    const skills = compositeSkill.skills;
    if (!skills.length) {
      return { success: false, error: 'No skills in composite', confidence: 0 };
    }

    let currentInput: unknown = input;
    const results: unknown[] = [];

    for (const skill of skills) {
      const result = await this.execute(skill, currentInput as never, context);
      if (!result.success) {
        return {
          success: false,
          error: `Sequential pipeline failed at ${skill.id}: ${result.error}`,
          confidence: 0,
        };
      }
      results.push(result.data);
      currentInput = result.data;
    }

    return {
      success: true,
      data: results[results.length - 1] as TOutput,
      confidence: 1,
    };
  }

  /**
   * Executes skills in parallel
   * @template TInput - The input type
   * @template TOutput - The output type
   * @param compositeSkill - The composite skill
   * @param input - The input data
   * @param context - The execution context
   * @returns Promise resolving to the skill result
   * @private
   */
  private async executeParallel<TInput = unknown, TOutput = unknown>(
    compositeSkill: CompositeSkill,
    input: TInput,
    context: SkillContext
  ): Promise<SkillResult<TOutput>> {
    const skills = compositeSkill.skills;
    if (!skills.length) {
      return { success: false, error: 'No skills in composite', confidence: 0 };
    }

    const settled = await Promise.allSettled(
      skills.map(skill => this.execute(skill, input as never, context))
    );

    const succeeded: { id: string; data: unknown }[] = [];
    const failed: { id: string; error: string }[] = [];

    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled' && outcome.value.success) {
        succeeded.push({ id: skills[i].id, data: outcome.value.data });
      } else {
        const msg = outcome.status === 'fulfilled'
          ? outcome.value.error ?? 'unknown'
          : (outcome.reason as Error)?.message ?? 'rejected';
        failed.push({ id: skills[i].id, error: msg });
      }
    });

    if (succeeded.length === 0) {
      return {
        success: false,
        error: `All ${skills.length} parallel skills failed: ${failed.map(f => f.error).join('; ')}`,
        confidence: 0,
      };
    }

    const merged: Record<string, unknown> = {};
    for (const s of succeeded) {
      merged[s.id] = s.data;
    }

    return {
      success: true,
      data: merged as TOutput,
      confidence: succeeded.length / skills.length,
    };
  }

  /**
   * Executes skills conditionally (first matching skill)
   * @template TInput - The input type
   * @template TOutput - The output type
   * @param compositeSkill - The composite skill
   * @param input - The input data
   * @param context - The execution context
   * @returns Promise resolving to the skill result
   * @private
   */
  private async executeConditional<TInput = unknown, TOutput = unknown>(
    compositeSkill: CompositeSkill,
    input: TInput,
    context: SkillContext
  ): Promise<SkillResult<TOutput>> {
    const skills = compositeSkill.skills;

    for (const skill of skills) {
      const canHandle = await skill.canHandle(context);
      if (!canHandle) continue;

      try {
        const result = await this.execute(skill, input as never, context);
        if (result.success) {
          return result as SkillResult<TOutput>;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.debug({ error: message }, `Conditional skill ${skill.id} failed, trying next`);
      }
    }

    return {
      success: false,
      error: `No skill in conditional composite could handle the input`,
      confidence: 0,
    };
  }

  /**
   * Updates execution metrics
   * @param executionTime - The execution time in milliseconds
   * @param success - Whether the execution was successful
   * @private
   */
  private updateMetrics(executionTime: number, success: boolean): void {
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    const totalTime = this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime;
    this.metrics.averageExecutionTime = totalTime / this.metrics.totalExecutions;
  }
}

/**
 * Creates a new SkillExecutor instance
 * @param options - Configuration options for the executor
 * @returns A new SkillExecutor
 */
export function createSkillExecutor(options: SkillExecutorOptions): SkillExecutor {
  return new SkillExecutor(options);
}
