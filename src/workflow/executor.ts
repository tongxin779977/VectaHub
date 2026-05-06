import { spawn, ChildProcess } from 'child_process';
import type { Step, ExecutionStatus, SandboxMode } from '../types/index.js';
import { createDetector, type Detector } from '../sandbox/detector.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import { interpolateString } from './interpolation.js';
import { audit, getCurrentSessionId } from '../utils/audit.js';
import { createRBACManager, type RoleName } from '../security-protocol/rbac.js';

// Import decoupled handlers
import { handleIf } from './handlers/if-handler.js';
import { handleParallel } from './handlers/parallel-handler.js';
import { handleForEach } from './handlers/foreach-handler.js';
import { createOpenCliHandler } from './handlers/opencli-handler.js';
import { createExecHandler } from './handlers/exec-handler.js';
import type { StepHandler, ExecuteStepFn, ExecutionContext, ExecutorOptions, ExecutionResult } from './handlers/types.js';

const DEFAULT_TIMEOUT = 60000;

export interface CLIResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
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

function shouldAllow(
  detection: { isDangerous: boolean; level: string },
  mode: SandboxMode
): boolean {
  if (!detection.isDangerous) return true;
  if (detection.level === 'critical') return mode === 'CONSENSUS';
  if (detection.level === 'high') return mode === 'CONSENSUS' || mode === 'RELAXED';
  return true;
}

export function createExecutor(sandboxManager?: SandboxManager): Executor {
  const detector: Detector = createDetector();

  async function exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult> {
    const startTime = Date.now();
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    if ((options as any).role) {
      const rbac = createRBACManager();
      const fullCommand = `${cli} ${args.join(' ')}`;
      if (!rbac.canExecute((options as any).role, fullCommand, cli)) {
        const sessionId = getCurrentSessionId();
        audit.securityAction('RBAC_DENIED', fullCommand, `Role ${(options as any).role} blocked command`, sessionId);
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `Command denied by RBAC: role "${(options as any).role}" cannot execute "${cli}"`,
          duration: Date.now() - startTime,
        };
      }
    }

    return new Promise((resolve, reject) => {
      const child = spawn(cli, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
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

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
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

      child.on('error', (err) => {
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
    });
    return {
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: result.duration,
    };
  }

  // Registry for handlers
  const stepHandlers: Record<string, StepHandler> = {
    if: handleIf,
    parallel: handleParallel,
    for_each: handleForEach,
    opencli: createOpenCliHandler({ detector, audit, sandboxManager, exec, execInSandbox }),
    exec: createExecHandler({ detector, audit, sandboxManager, exec, execInSandbox, shouldAllow }),
  };

  const extendedStepHandlers: Record<string, StepHandler> = {};

  const executeStep: ExecuteStepFn = async (step, options, context) => {
    const startTime = Date.now();

    // Dry-run handling (optimized and consolidated)
    if (options.dryRun && ['exec', 'opencli'].includes(step.type)) {
      return {
        stepId: step.id,
        status: 'COMPLETED',
        output: [`[DRY RUN] Would execute: ${step.cli || step.command} ${step.args?.join(' ') || ''}`],
        duration: 0,
      };
    }

    const handler = extendedStepHandlers[step.type] || stepHandlers[step.type];

    if (handler) {
      return handler(step, options, context, executeStep, startTime);
    }

    // Default fallback for legacy or unknown types
    if (step.type === 'delegate') {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `No handler registered for step type: ${step.type}`,
        duration: Date.now() - startTime,
      };
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      duration: Date.now() - startTime,
    };
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
      if (!['exec', 'for_each', 'if', 'parallel', 'opencli', 'delegate'].includes(step.type)) {
        errors.push(`Invalid step type: ${step.type}`);
      }
      if (step.type === 'exec' && !step.cli) errors.push('exec step must have a cli command');
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
