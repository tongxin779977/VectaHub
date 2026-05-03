import { spawn, ChildProcess } from 'child_process';
import type { Step, ExecutionStatus, SandboxMode } from '../types/index.js';
import { createDetector, type Detector } from '../sandbox/detector.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import { interpolateString, interpolateStep } from './interpolation.js';
import { audit, getCurrentSessionId } from '../utils/audit.js';
import { createRBACManager, type RoleName } from '../security-protocol/rbac.js';

const DEFAULT_TIMEOUT = 60000;

export interface ExecutorOptions {
  mode: SandboxMode;
  timeout?: number;
  dryRun?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  useSandbox?: boolean;
  role?: RoleName;
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

export interface CLIResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface ExecutionContext {
  variables: Record<string, string[]>;
  previousOutputs: Record<string, string[]>;
}

export interface Executor {
  exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult>;
  execute(step: Step, options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult>;
  executeWorkflow(steps: Step[], options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult[]>;
  validateStep(step: Step): { valid: boolean; errors: string[] };
  killCurrentProcess(): void;
  getCurrentProcess(): ChildProcess | null;
  interpolateString(template: string, context: ExecutionContext): string;
}

let currentChildProcess: ChildProcess | null = null;

function shouldAllow(
  detection: { isDangerous: boolean; level: string },
  mode: SandboxMode
): boolean {
  if (!detection.isDangerous) {
    return true;
  }

  if (detection.level === 'critical') {
    return mode === 'CONSENSUS';
  }
  if (detection.level === 'high') {
    return mode === 'CONSENSUS' || mode === 'RELAXED';
  }
  return true;
}

export function createExecutor(sandboxManager?: SandboxManager): Executor {
  const detector: Detector = createDetector();

  async function exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult> {
    const startTime = Date.now();
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    // RBAC check
    if (options.role) {
      const rbac = createRBACManager();
      const fullCommand = `${cli} ${args.join(' ')}`;
      if (!rbac.canExecute(options.role, fullCommand, cli)) {
        const sessionId = getCurrentSessionId();
        audit.securityAction('RBAC_DENIED', fullCommand, `Role ${options.role} blocked command`, sessionId);
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `Command denied by RBAC: role "${options.role}" cannot execute "${cli}"`,
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
          if (!child.killed) {
            child.kill('SIGTERM');
          }
        }, timeout);
      }

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        currentChildProcess = null;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
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
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        reject(new Error(`Child process error: ${err.message}`));
      });
    });
  }

  async function execInSandbox(
    cli: string,
    args: string[],
    options: ExecutorOptions
  ): Promise<CLIResult> {
    if (!sandboxManager) {
      return exec(cli, args, options);
    }

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

  function evaluateCondition(condition: string, context: ExecutionContext): boolean {
    const exitCodeMatch = condition.match(/\$\{(\w+)\.exitCode\}\s*==\s*0/);
    if (exitCodeMatch) {
      const stepId = exitCodeMatch[1];
      const outputs = context.previousOutputs[stepId];
      return outputs && outputs.length === 0;
    }

    const eqMatch = condition.match(/(\w+)\s*==\s*(.+)/);
    if (eqMatch) {
      const [, varName, expectedValue] = eqMatch;
      const actualValue = context.variables[varName]?.[0];
      return actualValue?.trim() === expectedValue.trim();
    }

    return false;
  }

  async function handleExec(step: Step, options: ExecutorOptions, context: ExecutionContext, startTime: number): Promise<ExecutionResult> {
    const interpolatedCli = interpolateString(step.cli!, context);
    const interpolatedArgs = (step.args || []).map(arg => interpolateString(arg, context));

    const detection = detector.detect(interpolatedCli);

    audit.sandboxDetect(
      detection.isDangerous,
      detection.level || 'none',
      interpolatedCli,
      'unknown'
    );

    if (!shouldAllow(detection, options.mode)) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `Dangerous command blocked: ${detection.reason}`,
        duration: Date.now() - startTime,
      };
    }

    try {
      const result = options.useSandbox && sandboxManager
        ? await execInSandbox(interpolatedCli, interpolatedArgs, options)
        : await exec(interpolatedCli, interpolatedArgs, options);

      audit.executorResult(
        step.id,
        interpolatedCli,
        result.exitCode,
        result.duration,
        'unknown',
        { stdoutLength: result.stdout.length, stderrLength: result.stderr.length }
      );

      const outputs = result.stdout ? [result.stdout] : [];
      context.previousOutputs[step.id] = outputs;

      return {
        stepId: step.id,
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: outputs,
        error: result.success ? undefined : result.stderr,
        duration: Date.now() - startTime,
        sandboxed: options.useSandbox && sandboxManager ? true : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        stepId: step.id,
        status: 'FAILED',
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  async function handleOpenCli(step: Step, options: ExecutorOptions, context: ExecutionContext, startTime: number): Promise<ExecutionResult> {
    const site = interpolateString(step.site || '', context);
    const command = interpolateString(step.command || '', context);
    const args = (step.args || []).map((arg: string) => interpolateString(arg, context));

    const fullArgs = [site, command, ...args];

    const detection = detector.detect('opencli');

    audit.sandboxDetect(
      detection.isDangerous,
      detection.level || 'none',
      `opencli ${site} ${command}`,
      'unknown'
    );

    try {
      const result = options.useSandbox && sandboxManager
        ? await execInSandbox('opencli', fullArgs, options)
        : await exec('opencli', fullArgs, options);

      audit.executorResult(
        step.id,
        'opencli',
        result.exitCode,
        result.duration,
        'unknown',
        { stdoutLength: result.stdout.length, stderrLength: result.stderr.length }
      );

      const outputs = result.stdout ? [result.stdout] : [];
      const storageKey = (step as any).outputVar || step.id;
      context.previousOutputs[storageKey] = outputs;

      return {
        stepId: step.id,
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: outputs,
        error: result.success ? undefined : result.stderr,
        duration: Date.now() - startTime,
        sandboxed: options.useSandbox && sandboxManager ? true : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        stepId: step.id,
        status: 'FAILED',
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  async function handleForEach(step: Step, options: ExecutorOptions, context: ExecutionContext, startTime: number): Promise<ExecutionResult> {
    const itemsStr = interpolateString(step.items || '', context);
    const items = itemsStr.split('\n').filter(Boolean);

    for (const item of items) {
      const itemContext: ExecutionContext = {
        ...context,
        variables: { ...context.variables, item: [item] },
      };

      for (const bodyStep of step.body || []) {
        const interpolatedStep = interpolateStep(bodyStep, itemContext);
        const result = await executeStep(interpolatedStep, options, itemContext);

        if (result.status === 'FAILED') {
          return {
            stepId: step.id,
            status: 'FAILED',
            iterations: items.length,
            duration: Date.now() - startTime,
          };
        }
      }
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      iterations: items.length,
      duration: Date.now() - startTime,
    };
  }

  async function handleIf(step: Step, options: ExecutorOptions, context: ExecutionContext, startTime: number): Promise<ExecutionResult> {
    const condition = interpolateString(step.condition || '', context);
    const conditionMet = evaluateCondition(condition, context);

    if (conditionMet && step.body) {
      for (const bodyStep of step.body) {
        const result = await executeStep(bodyStep, options, context);
        if (result.status === 'FAILED') {
          return {
            stepId: step.id,
            status: 'FAILED',
            duration: Date.now() - startTime,
          };
        }
      }
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      duration: Date.now() - startTime,
    };
  }

  async function handleParallel(step: Step, options: ExecutorOptions, context: ExecutionContext, startTime: number): Promise<ExecutionResult> {
    const promises = (step.body || []).map(bodyStep =>
      executeStep(bodyStep, options, context)
    );
    const results = await Promise.all(promises);
    const hasFailed = results.some(r => r.status === 'FAILED');

    return {
      stepId: step.id,
      status: hasFailed ? 'FAILED' : 'COMPLETED',
      iterations: results.length,
      duration: Date.now() - startTime,
    };
  }

  type StepHandler = (step: Step, options: ExecutorOptions, context: ExecutionContext, startTime: number) => Promise<ExecutionResult>;

  const stepHandlers: Record<string, StepHandler> = {
    opencli: handleOpenCli,
    for_each: handleForEach,
    if: handleIf,
    parallel: handleParallel,
  };

  async function executeStep(step: Step, options: ExecutorOptions, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const handler = stepHandlers[step.type] || (step.cli ? handleExec : null);

    if (handler) {
      return handler(step, options, context, startTime);
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      duration: Date.now() - startTime,
    };
  }

  return {
    exec: (cli, args, options) => {
      if (options.useSandbox && sandboxManager) {
        return execInSandbox(cli, args, options);
      }
      return exec(cli, args, options);
    },
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
      if (options.dryRun) {
        return {
          stepId: step.id,
          status: 'COMPLETED',
          output: [`[DRY RUN] Would execute: ${step.cli} ${step.args?.join(' ')}`],
          duration: 0,
        };
      }

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

        if (result.status === 'FAILED' && options.mode === 'STRICT') {
          break;
        }
      }

      return results;
    },

    validateStep(step: Step): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      if (!step.id) { errors.push('Step must have an id'); }

      if (!['exec', 'for_each', 'if', 'parallel', 'opencli'].includes(step.type)) {
        errors.push(`Invalid step type: ${step.type}`);
      }

      if (step.type === 'exec' && !step.cli) {
        errors.push('exec step must have a cli command');
      }

      if (step.type === 'opencli' && (!step.site || !step.command)) {
        errors.push('opencli step must have site and command');
      }

      if (step.type === 'for_each' && (!step.items || !step.body)) {
        errors.push('for_each step must have items and body');
      }

      if (step.type === 'if' && !step.condition) {
        errors.push('if step must have a condition');
      }

      return { valid: errors.length === 0, errors };
    },
  };
}

export { createSandboxManager };
