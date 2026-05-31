import type { ChildProcess } from 'child_process';
import type { Step, SandboxMode } from '../types/index.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { createDetector, type Detector } from '../sandbox/detector.js';
import { createSemanticDetector, type SemanticDetector } from '../sandbox/semantic-detector.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import { interpolateString } from './interpolation.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import { createSecurityGuard } from '../security-protocol/factory.js';
import type { SecurityGuard } from '../types/security.js';
import { PolicyManager } from './policy-manager.js';

// Import decoupled handlers
import { handleIf } from './handlers/if-handler.js';
import { handleParallel } from './handlers/parallel-handler.js';
import { handleForEach } from './handlers/foreach-handler.js';
import { createOpenCliHandler } from './handlers/opencli-handler.js';
import { createExecHandler } from './handlers/exec-handler.js';
import { createDelegateHandler, type DelegateHandlerDeps } from './handlers/delegate-handler.js';
import type { StepHandler, ExecuteStepFn, ExecutionContext, ExecutorOptions, ExecutionResult, HandlerDependencies, CLIResult } from './handlers/types.js';
export type { StepHandler, ExecuteStepFn, ExecutionContext, ExecutorOptions, ExecutionResult, HandlerDependencies, CLIResult };

const DEFAULT_TIMEOUT = 60000;

/**
 * 执行器依赖注入接口
 * 用于支持自定义替换各个组件，提高可测试性
 */
export interface ExecutorDeps {
  environment: IEnvironmentService;
  detector?: Detector;
  semanticDetector?: SemanticDetector;
  policyManager?: PolicyManager;
  sandboxManager?: SandboxManager;
  audit: AuditHelper;
  securityGuard?: SecurityGuard;
  stepHandlers?: Record<string, StepHandler>;
  delegateHandlerDeps?: DelegateHandlerDeps;
}

export interface Executor {
  exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult>;
  execute(step: Step, options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult>;
  executeWorkflow(steps: Step[], options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult[]>;
  validateStep(step: Step): { valid: boolean; errors: string[] };
  killCurrentProcess(): void;
  getCurrentProcess(): ChildProcess | null;
  interpolateString(template: string, context: ExecutionContext): string;
  registerStepHandler(type: string, handler: StepHandler): void;
}

let currentChildProcess: ChildProcess | null = null;

function isLegacyExecStep(step: Step): boolean {
  return !step.type && Boolean(step.cli);
}

function getUnregisteredStepTypeLabel(step: Step): string {
  return step.type || '<missing>';
}

function createMissingHandlerResult(step: Step, startTime: number): ExecutionResult {
  return {
    stepId: step.id,
    status: 'FAILED',
    error: `No handler registered for step type: ${getUnregisteredStepTypeLabel(step)}`,
    duration: Date.now() - startTime,
  };
}

function shouldAllow(
  detection: { isDangerous: boolean; level: string },
  mode: SandboxMode
): boolean {
  if (!detection.isDangerous) return true;
  if (detection.level === 'critical') return mode === 'CONSENSUS';
  if (detection.level === 'high') return mode === 'CONSENSUS' || mode === 'RELAXED';
  return true;
}

export function createExecutor(deps: ExecutorDeps): Executor {
  const environment = deps.environment;
  const detector: Detector = deps.detector ?? createDetector();
  const semanticDetector: SemanticDetector = deps.semanticDetector ?? createSemanticDetector();
  const auditHelper: AuditHelper = deps.audit;
  const policyManager = deps.policyManager ?? new PolicyManager(auditHelper);
  const securityGuard: SecurityGuard = deps.securityGuard ?? createSecurityGuard();
  const sandboxManager = deps.sandboxManager ?? createSandboxManager(
    {},
    { securityGuard, audit: auditHelper }
  );
  const customStepHandlers = deps.stepHandlers || {};

  async function exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult> {
    const startTime = Date.now();
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    const rbacResult = policyManager.checkRBAC(cli, args, options);
    if (!rbacResult.allowed) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: rbacResult.error || 'Denied by RBAC',
        duration: Date.now() - startTime,
      };
    }

    return new Promise((resolve, reject) => {
      const child = environment.spawn(cli, args, {
        cwd: options.cwd || environment.getCwd(),
        env: { ...environment.getAllEnv(), ...options.env },
      });

      currentChildProcess = child;
      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          if (!child.killed) child.kill('SIGTERM');
        }, timeout);
      }

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code: number | null) => {
        currentChildProcess = null;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
        });
      });

      child.on('error', (err: Error) => {
        currentChildProcess = null;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        reject(new Error(`Child process error: ${err.message}`));
      });
    });
  }

  async function execInSandbox(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult> {
    if (!sandboxManager) return exec(cli, args, options);
    const result = await sandboxManager.exec(cli, args, {
      mode: options.mode,
      timeout: options.timeout || DEFAULT_TIMEOUT,
      cwd: options.cwd,
      env: options.env,
      sessionId: options.sessionId,
    });
    return {
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: result.duration,
    };
  }

  const handlerDeps: HandlerDependencies = {
    detector,
    semanticDetector,
    audit: auditHelper,
    securityGuard,
    sandboxManager,
    exec,
    execInSandbox,
    shouldAllow
  };

  // For backward compatibility, only use new implementation when delegateHandlerDeps is explicitly provided
  // otherwise keep the old behavior (agentModule only) behavior
  let delegateHandlerDeps: DelegateHandlerDeps = deps.delegateHandlerDeps || {};

  const defaultStepHandlers: Record<string, StepHandler> = {
    if: handleIf,
    parallel: handleParallel,
    for_each: handleForEach,
    opencli: createOpenCliHandler(handlerDeps),
    exec: createExecHandler(handlerDeps),
    delegate: createDelegateHandler(delegateHandlerDeps),
  };

  // 合并自定义 stepHandlers 到默认 stepHandlers，自定义覆盖默认
  const stepHandlers: Record<string, StepHandler> = {
    ...defaultStepHandlers,
    ...customStepHandlers,
  };

  const extendedStepHandlers: Record<string, StepHandler> = {};

  const executeStep: ExecuteStepFn = async (step, options, context) => {
    const startTime = Date.now();
    const handlerType = isLegacyExecStep(step) ? 'exec' : step.type;

    if (options.dryRun && handlerType && ['exec', 'opencli'].includes(handlerType)) {
      return {
        stepId: step.id,
        status: 'COMPLETED',
        output: [`[DRY RUN] Would execute: ${step.cli || step.command} ${step.args?.join(' ') || ''}`],
        duration: 0,
      };
    }

    const handler = handlerType
      ? extendedStepHandlers[handlerType] || stepHandlers[handlerType]
      : undefined;

    if (handler) {
      return handler(step, options, context, executeStep, startTime);
    }

    return createMissingHandlerResult(step, startTime);
  };

  return {
    exec,
    interpolateString,

    getCurrentProcess(): ChildProcess | null {
      return currentChildProcess;
    },

    killCurrentProcess(): void {
      if (currentChildProcess && !currentChildProcess.killed) {
        currentChildProcess.kill('SIGKILL');
        currentChildProcess = null;
      }
    },

    async execute(step: Step, options: ExecutorOptions = { mode: 'STRICT' }, context: ExecutionContext = { variables: {}, previousOutputs: {} }): Promise<ExecutionResult> {
      const validation = this.validateStep(step);
      if (!validation.valid) {
        return {
          stepId: step.id,
          status: 'FAILED',
          error: validation.errors.join(', '),
          duration: 0,
        };
      }
      return executeStep(step, options, context);
    },

    async executeWorkflow(steps: Step[], options: ExecutorOptions = { mode: 'STRICT' }, context: ExecutionContext = { variables: {}, previousOutputs: {} }): Promise<ExecutionResult[]> {
      // 1. 自动化凭证预检 (Pre-flight Checks)
      const preFlightResult = await policyManager.runPreFlightCheck(steps, exec, options);
      if (!preFlightResult.success) {
        return [{
          stepId: 'pre-flight',
          status: 'FAILED',
          error: preFlightResult.error || 'Pre-flight check failed'
        }];
      }

      // 2. 按序执行步骤
      const results: ExecutionResult[] = [];
      for (const step of steps) {
        const result = await executeStep(step, options, context);
        results.push(result);
        if (result.status === 'FAILED' && options.mode === 'STRICT') break;
      }
      return results;
    },

    validateStep(step: Step): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      if (!step.id) errors.push('Step must have an id');
      const isLegacyExec = isLegacyExecStep(step);
      if (!isLegacyExec && !['exec', 'for_each', 'if', 'parallel', 'opencli', 'delegate'].includes(step.type)) {
        errors.push(`Invalid step type: ${step.type}`);
      }
      if ((step.type === 'exec' || isLegacyExec) && !step.cli) errors.push('exec step must have a cli command');
      if (step.type === 'opencli' && (!step.site || !step.command)) errors.push('opencli step must have site and command');
      if (step.type === 'for_each' && (!step.items || !step.body)) errors.push('for_each step must have items and body');
      if (step.type === 'if' && !step.condition) errors.push('if step must have a condition');
      if (step.type === 'delegate' && (!step.delegateTo || !step.delegatePrompt)) {
        errors.push('delegate step must have delegateTo and delegatePrompt');
      }
      return { valid: errors.length === 0, errors };
    },

    registerStepHandler(type: string, handler: StepHandler): void {
      extendedStepHandlers[type] = handler;
    },
  };
}

export { createSandboxManager };
