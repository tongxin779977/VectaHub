import type { ExecutionContext, StepOutput } from './context-manager.js';

export interface ContextTransformerOptions {
  preserveTimestamps?: boolean;
  serializeDates?: boolean;
  deepClone?: boolean;
}

export class ContextTransformer {
  private options: Required<ContextTransformerOptions>;

  constructor(options: ContextTransformerOptions = {}) {
    this.options = {
      preserveTimestamps: true,
      serializeDates: true,
      deepClone: true,
      ...options,
    };
  }

  transform(
    source: ExecutionContext,
    target: Partial<ExecutionContext> = {}
  ): ExecutionContext {
    const transformed: ExecutionContext = {
      ...source,
      ...target,
      variables: new Map(source.variables),
      stepOutputs: new Map(),
      env: { ...source.env },
    };

    for (const [stepId, output] of source.stepOutputs) {
      transformed.stepOutputs.set(stepId, this.cloneStepOutput(output));
    }

    return transformed;
  }

  export(context: ExecutionContext): Record<string, unknown> {
    const variables: Record<string, unknown> = {};
    for (const [key, value] of context.variables) {
      variables[key] = this.serializeValue(value);
    }

    const stepOutputs: Record<string, unknown> = {};
    for (const [stepId, output] of context.stepOutputs) {
      stepOutputs[stepId] = {
        result: this.serializeValue(output.result),
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: output.exitCode,
        timestamp: this.options.serializeDates
          ? output.timestamp.toISOString()
          : output.timestamp,
        metadata: this.serializeValue(output.metadata),
      };
    }

    return {
      workflowId: context.workflowId,
      executionId: context.executionId,
      sessionId: context.sessionId,
      variables,
      stepOutputs,
      cwd: context.cwd,
      startTime: this.options.serializeDates
        ? context.startTime.toISOString()
        : context.startTime,
      env: this.serializeEnv(context.env),
    };
  }

  exportToJSON(context: ExecutionContext, space?: string | number): string {
    return JSON.stringify(this.export(context), null, space);
  }

  import(data: Record<string, unknown>): ExecutionContext {
    const variables = new Map<string, unknown>();
    const rawVariables = data.variables as Record<string, unknown> || {};
    for (const [key, value] of Object.entries(rawVariables)) {
      variables.set(key, this.deserializeValue(value));
    }

    const stepOutputs = new Map<string, StepOutput>();
    const rawStepOutputs = data.stepOutputs as Record<string, any> || {};
    for (const [stepId, outputData] of Object.entries(rawStepOutputs)) {
      stepOutputs.set(stepId, {
        stepId,
        result: this.deserializeValue(outputData.result),
        stdout: outputData.stdout,
        stderr: outputData.stderr,
        exitCode: outputData.exitCode,
        timestamp: this.parseDate(outputData.timestamp),
        metadata: this.deserializeValue(outputData.metadata) as Record<string, unknown> | undefined,
      });
    }

    return {
      workflowId: data.workflowId as string,
      executionId: data.executionId as string,
      sessionId: data.sessionId as string,
      variables,
      stepOutputs,
      env: this.deserializeEnv(data.env as Record<string, string | undefined> || {}),
      cwd: data.cwd as string || process.cwd(),
      startTime: this.parseDate(data.startTime),
    };
  }

  importFromJSON(json: string): ExecutionContext {
    return this.import(JSON.parse(json));
  }

  mergeContexts(
    primary: ExecutionContext,
    secondary: ExecutionContext,
    override = true
  ): ExecutionContext {
    const merged = this.transform(primary);
    
    for (const [key, value] of secondary.variables) {
      if (override || !merged.variables.has(key)) {
        merged.variables.set(key, value);
      }
    }
    
    for (const [stepId, output] of secondary.stepOutputs) {
      if (override || !merged.stepOutputs.has(stepId)) {
        merged.stepOutputs.set(stepId, this.cloneStepOutput(output));
      }
    }
    
    merged.env = { ...merged.env, ...secondary.env };
    
    return merged;
  }

  private serializeValue(value: unknown): unknown {
    if (value instanceof Date) {
      return this.options.serializeDates ? value.toISOString() : value;
    }
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    if (value instanceof Set) {
      return Array.from(value);
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map((item) => this.serializeValue(item));
      }
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.serializeValue(val);
      }
      return result;
    }
    return value;
  }

  private deserializeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const date = this.parseDate(value);
      if (date) return date;
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map((item) => this.deserializeValue(item));
      }
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.deserializeValue(val);
      }
      return result;
    }
    return value;
  }

  private parseDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date;
    }
    return new Date();
  }

  private cloneStepOutput(output: StepOutput): StepOutput {
    return {
      stepId: output.stepId,
      result: this.options.deepClone
        ? this.deepClone(output.result)
        : output.result,
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: output.exitCode,
      timestamp: this.options.preserveTimestamps
        ? new Date(output.timestamp.getTime())
        : new Date(),
      metadata: this.options.deepClone
        ? this.deepClone(output.metadata)
        : output.metadata,
    };
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  private serializeEnv(env: Record<string, string>): Record<string, string> {
    return { ...env };
  }

  private deserializeEnv(env: Record<string, string | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
}

export function createContextTransformer(
  options?: ContextTransformerOptions
): ContextTransformer {
  return new ContextTransformer(options);
}
