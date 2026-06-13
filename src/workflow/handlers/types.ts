import type { Step, SandboxMode, ExecutionStatus } from '../../types/index.js';
import type { RoleName } from '../../security-protocol/rbac.js';
import type { ExpressionData } from '../expression-engine.js';
import type { Detector } from '../../sandbox/detector.js';
import type { SemanticDetector } from '../../sandbox/semantic-detector.js';
import type { SandboxManager } from '../../sandbox/sandbox.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';
import type { SecurityGuard } from '../../types/security.js';

export interface ExecutorOptions {
  mode: SandboxMode;
  timeout?: number;
  dryRun?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  stdinInput?: string;
  useSandbox?: boolean;
  role?: RoleName;
  sessionId?: string;
  allowedEnvVars?: string[];
}

export interface ExecutionContext {
  variables: Record<string, string[]>;
  previousOutputs: Record<string, string[]>;
  executionId?: string;
  expressionData?: ExpressionData;
}

export interface ExecutionResult {
  stepId: string;
  status: ExecutionStatus;
  output?: string[];
  error?: string;
  exitCode?: number;
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

export interface CLIResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface HandlerDependencies {
  detector: Detector;
  semanticDetector?: SemanticDetector;
  audit: AuditHelper;
  securityGuard: SecurityGuard;
  sandboxManager?: SandboxManager;
  exec: (cli: string, args: string[], options: ExecutorOptions) => Promise<CLIResult>;
  execInSandbox: (cli: string, args: string[], options: ExecutorOptions) => Promise<CLIResult>;
  shouldAllow: (detection: { isDangerous: boolean; level: string }, mode: SandboxMode) => boolean;
}
