
import { Skill, SkillContext, SkillResult, CompositeSkill } from './types.js';

let logger: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void } | null = null;
try {
  const mod = await import('../utils/logger.js');
  logger = (mod as Record<string, unknown>).logger as typeof logger;
} catch { /* logger unavailable in test environments */ }

export interface SkillExecutorOptions {
  maxRetries?: number;
  timeout?: number;
}

export class SkillExecutor {
  private options: SkillExecutorOptions;

  constructor(options: SkillExecutorOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      timeout: options.timeout ?? 30000
    };
  }

  async execute<TInput = unknown, TOutput = unknown>(
    skill: Skill<TInput, TOutput>,
    input: TInput,
    context: SkillContext
  ): Promise<SkillResult<TOutput>> {
    let retries = 0;
    let lastError: Error | null = null;

    while (retries <= this.options.maxRetries!) {
      try {
        logger?.debug(`Executing skill: ${skill.name} (v${skill.version})`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Skill execution timeout after ${this.options.timeout}ms`)), this.options.timeout);
        });

        const result = await Promise.race([
          skill.execute(input, context),
          timeoutPromise
        ]);

        logger?.debug(`Skill ${skill.name} executed successfully: ${result.success}`);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger?.warn(`Skill ${skill.name} failed (retry ${retries + 1}/${this.options.maxRetries}):`, lastError.message);
        retries++;

        if (retries <= this.options.maxRetries!) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
        }
      }
    }

    return {
      success: false,
      error: `Skill ${skill.name} failed after ${this.options.maxRetries} retries: ${lastError?.message}`,
      confidence: 0
    };
  }

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
      } catch {
        logger?.debug(`Conditional skill ${skill.id} failed, trying next`);
      }
    }

    return {
      success: false,
      error: `No skill in conditional composite could handle the input`,
      confidence: 0,
    };
  }
}

export function createSkillExecutor(options?: SkillExecutorOptions): SkillExecutor {
  return new SkillExecutor(options);
}
