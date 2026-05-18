/**
 * Workflow 模块接口定义
 * 遵循 Interface-first 原则，不包含实现代码
 */

import type {
  Workflow,
  Step,
  ExecutionRecord,
  StepRecord,
  ExecutionStatus,
} from '../types/index.js';

/**
 * 执行选项接口
 */
export interface RetryOptions {
  maxAttempts?: number;
  backoffMultiplier?: number;
  initialBackoff?: number;
}

export interface ProgressInfo {
  currentStep: number;
  totalSteps: number;
  stepId: string;
  stepType: string;
  status: 'starting' | 'completed' | 'failed';
}

export interface ExecuteOptions {
  dryRun?: boolean;
  timeout?: number;
  mode?: 'strict' | 'relaxed' | 'consensus';
  retry?: RetryOptions;
  onProgress?: (info: ProgressInfo) => void;
  initialVariables?: Record<string, unknown>;
}

export interface CreateWorkflowOptions {
  persist?: boolean;
}

/**
 * 工作流引擎接口
 */
export interface IWorkflowEngine {
  createWorkflow(name: string, steps: Step[], options?: CreateWorkflowOptions): Promise<Workflow>;
  addStep(workflowId: string, step: Step): Promise<void>;
  removeStep(workflowId: string, stepId: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  getSystemWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  execute(workflow: Workflow, options?: ExecuteOptions, initialVariables?: Record<string, unknown>): Promise<ExecutionRecord>;
  executeAsync(workflow: Workflow, options?: ExecuteOptions): void;
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  getStatus(): ExecutionRecord | undefined;
  waitForCompletion(): Promise<ExecutionRecord>;
  loadWorkflows(): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | undefined>;
  resumeFromFailure(executionId: string, stepIndex?: number, options?: ExecuteOptions): Promise<ExecutionRecord>;
}

/**
 * 执行器接口
 */
export interface IExecutor {
  executeStep(
    step: Step,
    context: Record<string, unknown>,
    options?: { dryRun?: boolean }
  ): Promise<{
    success: boolean;
    output: unknown[];
    exitCode?: number;
    error?: string;
  }>;
}

/**
 * 存储接口
 */
export interface IStorage {
  saveWorkflow(workflow: Workflow): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  deleteWorkflow(id: string): Promise<void>;
  saveExecution(execution: ExecutionRecord): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | undefined>;
  listExecutions(): Promise<ExecutionRecord[]>;
}

/**
 * 上下文管理器接口
 */
export interface IContextManager {
  createContext(
    workflowId: string,
    executionId: string,
    sessionId: string,
    initialVariables: Record<string, unknown>,
    cwd: string,
    options?: { auditEnabled?: boolean }
  ): void;
  getContext(executionId: string): unknown;
  setStepOutput(
    executionId: string,
    stepId: string,
    output: unknown[],
    outputMeta?: { stdout: string; exitCode?: number; outputVar?: string }
  ): void;
  getStepOutput(executionId: string, stepId: string): unknown[] | undefined;
}

/**
 * 状态管理器接口
 */
export interface IStateManager {
  state: 'IDLE' | 'RUNNING' | 'PAUSED' | 'ABORTING' | 'ABORTED';
  currentExecution: ExecutionRecord | undefined;
  setState(newState: 'IDLE' | 'RUNNING' | 'PAUSED' | 'ABORTING' | 'ABORTED'): void;
}
