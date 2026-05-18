import { audit } from '../infrastructure/audit/index.js';
import type { ExpressionData } from './expression-engine.js';
import { LifecycleManager } from '../utils/lifecycle-manager.js';

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  sessionId: string;
  auditEnabled?: boolean;
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
  metadata?: Record<string, unknown> & {
    outputVar?: string;
  };
}

export interface ContextVariable {
  name: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  source: 'input' | 'step_output' | 'env' | 'computed';
  timestamp: Date;
}

export interface ExecutorContext {
  variables: Record<string, string[]>;
  previousOutputs: Record<string, string[]>;
  executionId?: string;
  expressionData?: ExpressionData;
}

export class ContextManager {
  private lifecycle: LifecycleManager<ExecutionContext>;
  private maxStepOutputs: number = 1000;

  constructor(options?: { maxContexts?: number; contextTtl?: number; maxStepOutputs?: number }) {
    if (options?.maxStepOutputs) this.maxStepOutputs = options.maxStepOutputs;
    
    this.lifecycle = new LifecycleManager<ExecutionContext>({
      ttl: options?.contextTtl ?? 3600000,
      maxCount: options?.maxContexts ?? 100,
      cleanupInterval: 60000,
      onEvicted: (executionId, context) => {
        if (context.auditEnabled !== false) {
          audit.securityAction('CONTEXT', executionId, 'DELETED', context.sessionId);
        }
      },
    });
  }

  createContext(
    workflowId: string,
    executionId: string,
    sessionId: string,
    initialVars: Record<string, unknown> = {},
    cwd: string = process.cwd(),
    options?: { auditEnabled?: boolean }
  ): ExecutionContext {
    const context: ExecutionContext = {
      workflowId,
      executionId,
      sessionId,
      auditEnabled: options?.auditEnabled ?? true,
      variables: new Map(Object.entries(initialVars)),
      stepOutputs: new Map(),
      env: { ...process.env } as Record<string, string>,
      cwd,
      startTime: new Date(),
    };

    this.lifecycle.set(executionId, context);

    if (context.auditEnabled !== false) {
      audit.securityAction('CONTEXT', executionId, 'CREATED', sessionId);
    }

    return context;
  }

  private updateActivity(executionId: string): void {
    this.lifecycle.updateActivity(executionId);
  }

  getExpressionData(executionId: string): ExpressionData {
    this.updateActivity(executionId);
    const context = this.lifecycle.get(executionId);
    if (!context) {
      return { steps: {}, env: {}, vars: {}, config: {} };
    }

    const steps: ExpressionData['steps'] = {};
    for (const [stepId, output] of context.stepOutputs) {
      const stepData = {
        output: output.result,
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: output.exitCode
      };
      steps[stepId] = stepData;
      const outputVar = output.metadata?.outputVar;
      if (outputVar && !steps[outputVar]) {
        steps[outputVar] = stepData;
      }
    }

    const vars: Record<string, unknown> = {};
    for (const [name, value] of context.variables) {
      vars[name] = value;
    }

    return {
      steps,
      env: context.env,
      vars,
      config: {}
    };
  }

  getContext(executionId: string): ExecutionContext | undefined {
    return this.lifecycle.get(executionId);
  }

  setVariable(executionId: string, name: string, value: unknown): void {
    const context = this.lifecycle.get(executionId);
    if (!context) {
      throw new Error(`Context not found: ${executionId}`);
    }

    context.variables.set(name, value);
  }

  getVariable(executionId: string, name: string): unknown {
    const context = this.lifecycle.get(executionId);
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
    const context = this.lifecycle.get(executionId);
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
    metadata?: { stdout?: string; stderr?: string; exitCode?: number; outputVar?: string }
  ): void {
    const context = this.lifecycle.get(executionId);
    if (!context) {
      throw new Error(`Context not found: ${executionId}`);
    }

    if (context.stepOutputs.size >= this.maxStepOutputs) {
      // Keep most recent outputs, evict oldest by insertion order
      const firstKey = context.stepOutputs.keys().next().value;
      if (firstKey) context.stepOutputs.delete(firstKey);
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
    const context = this.lifecycle.get(executionId);
    if (!context) {
      return undefined;
    }

    return context.stepOutputs.get(stepId);
  }

  getStepOutputAsVariable(executionId: string, outputVar: string): unknown {
    const context = this.lifecycle.get(executionId);
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
    const context = this.lifecycle.get(executionId);
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
    const context = this.lifecycle.get(executionId);
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
      auditEnabled: data.auditEnabled !== false,
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

    this.lifecycle.set(context.executionId, context);

    return context;
  }

  deleteContext(executionId: string): void {
    this.lifecycle.delete(executionId);
  }

  listContexts(): string[] {
    return this.lifecycle.keys();
  }

  clear(): void {
    this.lifecycle.clear();
  }

  toExecutorContext(executionId: string): ExecutorContext {
    const context = this.lifecycle.get(executionId);
    if (!context) {
      return { variables: {}, previousOutputs: {} };
    }

    const variables: Record<string, string[]> = {};
    for (const [key, value] of context.variables) {
      if (Array.isArray(value)) {
        variables[key] = value.map(String);
      } else if (value !== undefined && value !== null) {
        variables[key] = [String(value)];
      } else {
        variables[key] = [];
      }
    }

    const previousOutputs: Record<string, string[]> = {};
    for (const [stepId, output] of context.stepOutputs) {
      const result = output.result;
      let normalizedOutput: string[] = [];
      if (Array.isArray(result)) {
        normalizedOutput = result.map(String);
      } else if (result !== undefined && result !== null) {
        normalizedOutput = [String(result)];
      }
      if (output.stdout) {
        normalizedOutput = output.stdout.split('\n').filter(Boolean);
      }
      previousOutputs[stepId] = normalizedOutput;
      if (output.metadata?.outputVar) {
        previousOutputs[output.metadata.outputVar] = normalizedOutput;
      }
    }

    return {
      variables,
      previousOutputs,
      executionId,
      expressionData: this.getExpressionData(executionId),
    };
  }
}

export const contextManager = new ContextManager();

export function createContextManager(): ContextManager {
  return new ContextManager();
}
