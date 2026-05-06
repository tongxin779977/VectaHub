import type { Step, StepStatus, SandboxMode, ExecutionStatus } from '../../types/index.js';

export interface ExecutorOptions {
  mode: SandboxMode;
  timeout?: number;
  dryRun?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  useSandbox?: boolean;
}

export interface ExecutionContext {
  variables: Record<string, string[]>;
  previousOutputs: Record<string, string[]>;
}

export interface ExecutionResult {
  stepId: string;
  status: ExecutionStatus;
  output?: string[];
  error?: string;
  duration?: number;
  iterations?: number;
  sandboxed?: boolean;
}

export type ExecuteStepFn = (step: Step, options: ExecutorOptions, context: ExecutionContext) => Promise<ExecutionResult>;

export type StepHandler = (
  step: Step,
  options: ExecutorOptions,
  context: ExecutionContext,
  executeStep: ExecuteStepFn,
  startTime: number
) => Promise<ExecutionResult>;
