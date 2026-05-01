import { audit } from '../utils/audit.js';

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  sessionId: string;
  variables: Map<string, unknown>;
  stepOutputs: Map<string, StepOutput>;
  env: Record<string, string>;
  cwd: string;
  startTime: Date;
  parentContext?: ExecutionContext;
}

export interface StepOutput {
  stepId: string;
  result: unknown;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ContextVariable {
  name: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  source: 'input' | 'step_output' | 'env' | 'computed';
  timestamp: Date;
}

export class ContextManager {
  private contexts: Map<string, ExecutionContext> = new Map();

  createContext(
    workflowId: string,
    executionId: string,
    sessionId: string,
    initialVars: Record<string, unknown> = {},
    cwd: string = process.cwd()
  ): ExecutionContext {
    const context: ExecutionContext = {
      workflowId,
      executionId,
      sessionId,
      variables: new Map(Object.entries(initialVars)),
      stepOutputs: new Map(),
      env: { ...process.env } as Record<string, string>,
      cwd,
      startTime: new Date(),
    };

    this.contexts.set(executionId, context);

    audit.securityAction('CONTEXT', executionId, 'CREATED', sessionId);

    return context;
  }

  getContext(executionId: string): ExecutionContext | undefined {
    return this.contexts.get(executionId);
  }

  setVariable(executionId: string, name: string, value: unknown): void {
    const context = this.contexts.get(executionId);
    if (!context) {
      throw new Error(`Context not found: ${executionId}`);
    }

    context.variables.set(name, value);
  }

  getVariable(executionId: string, name: string): unknown {
    const context = this.contexts.get(executionId);
    if (!context) {
      return undefined;
    }

    if (context.variables.has(name)) {
      return context.variables.get(name);
    }

    if (context.parentContext?.variables.has(name)) {
      return context.parentContext.variables.get(name);
    }

    return undefined;
  }

  resolveVariable(executionId: string, value: string): string {
    const context = this.contexts.get(executionId);
    if (!context) {
      return value;
    }

    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const resolved = this.getVariable(executionId, varName);
      if (resolved === undefined) {
        return `\${${varName}}`;
      }
      return String(resolved);
    });
  }

  resolveArgs(executionId: string, args: string[]): string[] {
    return args.map(arg => this.resolveVariable(executionId, arg));
  }

  setStepOutput(
    executionId: string,
    stepId: string,
    result: unknown,
    metadata?: { stdout?: string; stderr?: string; exitCode?: number }
  ): void {
    const context = this.contexts.get(executionId);
    if (!context) {
      throw new Error(`Context not found: ${executionId}`);
    }

    const output: StepOutput = {
      stepId,
      result,
      stdout: metadata?.stdout,
      stderr: metadata?.stderr,
      exitCode: metadata?.exitCode,
      timestamp: new Date(),
      metadata,
    };

    context.stepOutputs.set(stepId, output);
  }

  getStepOutput(executionId: string, stepId: string): StepOutput | undefined {
    const context = this.contexts.get(executionId);
    if (!context) {
      return undefined;
    }

    return context.stepOutputs.get(stepId);
  }

  getStepOutputAsVariable(executionId: string, outputVar: string): unknown {
    const context = this.contexts.get(executionId);
    if (!context) {
      return undefined;
    }

    for (const [stepId, output] of context.stepOutputs) {
      if (stepId === outputVar || output.metadata?.outputVar === outputVar) {
        return output.result;
      }
    }

    return undefined;
  }

  interpolateString(executionId: string, template: string): string {
    const context = this.contexts.get(executionId);
    if (!context) {
      return template;
    }

    let result = template;

    result = result.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const value = this.getVariable(executionId, varName);
      return value !== undefined ? String(value) : `\${${varName}}`;
    });

    result = result.replace(/\$STEP_OUTPUT\[([^\]]+)\]/g, (_, stepId) => {
      const output = this.getStepOutput(executionId, stepId);
      return output?.result !== undefined ? String(output.result) : `$STEP_OUTPUT[${stepId}]`;
    });

    result = result.replace(/\$ENV\[([^\]]+)\]/g, (_, envName) => {
      return context.env[envName] || `$ENV[${envName}]`;
    });

    return result;
  }

  interpolateObject(executionId: string, obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(executionId, value);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item => {
          if (typeof item === 'string') {
            return this.interpolateString(executionId, item);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.interpolateObject(executionId, value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  exportContext(executionId: string): Record<string, unknown> {
    const context = this.contexts.get(executionId);
    if (!context) {
      return {};
    }

    const variables: Record<string, unknown> = {};
    for (const [key, value] of context.variables) {
      variables[key] = value;
    }

    const stepOutputs: Record<string, unknown> = {};
    for (const [stepId, output] of context.stepOutputs) {
      stepOutputs[stepId] = output.result;
    }

    return {
      workflowId: context.workflowId,
      executionId: context.executionId,
      sessionId: context.sessionId,
      variables,
      stepOutputs,
      cwd: context.cwd,
      startTime: context.startTime.toISOString(),
    };
  }

  importContext(data: Record<string, unknown>): ExecutionContext {
    const context: ExecutionContext = {
      workflowId: data.workflowId as string,
      executionId: data.executionId as string,
      sessionId: data.sessionId as string,
      variables: new Map(Object.entries(data.variables as Record<string, unknown> || {})),
      stepOutputs: new Map(),
      env: process.env as Record<string, string>,
      cwd: data.cwd as string || process.cwd(),
      startTime: new Date(data.startTime as string || Date.now()),
    };

    const stepOutputs = data.stepOutputs as Record<string, unknown> || {};
    for (const [stepId, result] of Object.entries(stepOutputs)) {
      context.stepOutputs.set(stepId, {
        stepId,
        result,
        timestamp: new Date(),
      });
    }

    this.contexts.set(context.executionId, context);

    return context;
  }

  deleteContext(executionId: string): void {
    const context = this.contexts.get(executionId);
    if (context) {
      this.contexts.delete(executionId);
      audit.securityAction('CONTEXT', executionId, 'DELETED', context.sessionId);
    }
  }

  listContexts(): string[] {
    return Array.from(this.contexts.keys());
  }

  clear(): void {
    this.contexts.clear();
  }
}

export const contextManager = new ContextManager();

export function createContextManager(): ContextManager {
  return new ContextManager();
}
