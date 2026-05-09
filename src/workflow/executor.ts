import { spawn, ChildProcess } from 'child_process';
import type { Step, ExecutionStatus, SandboxMode } from '../types/index.js';
import { createDetector, type Detector } from '../sandbox/detector.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import { interpolateString, interpolateStep } from './interpolation.js';
import { evaluateExpression } from './expression-engine.js';
import { contextManager } from './context-manager.js';
import { audit, getCurrentSessionId } from '../utils/audit.js';
import { createRBACManager, type RoleName } from '../security-protocol/rbac.js';

// Import decoupled handlers
import { handleIf } from './handlers/if-handler.js';
import { handleParallel } from './handlers/parallel-handler.js';
import { handleForEach } from './handlers/foreach-handler.js';
import { createOpenCliHandler } from './handlers/opencli-handler.js';
import { createExecHandler } from './handlers/exec-handler.js';
import type { StepHandler, ExecuteStepFn, ExecutionContext, ExecutorOptions, ExecutionResult } from './handlers/types.js';
export type { StepHandler, ExecuteStepFn, ExecutionContext, ExecutorOptions, ExecutionResult };

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

  function evaluateCondition(condition: string, context: ExecutionContext): boolean {
    const simpleEqMatch = condition.match(/^(\w+)\s*==\s*(.+)$/);
    if (simpleEqMatch) {
      const [, varName, expectedValue] = simpleEqMatch;
      const actualValue = context.variables[varName]?.[0];
      return actualValue?.trim() === expectedValue.trim();
    }

    let data: any;

    if (context.executionId) {
      try {
        data = contextManager.getExpressionData(context.executionId);
      } catch (e) {
        // Fallback to building data from context
      }
    }

    if (!data) {
      // Build basic expression data from context if no execution manager is available
      data = {
        steps: {},
        env: { ...process.env, ...context.variables.env?.[0] ? JSON.parse(context.variables.env[0]) : {} },
        vars: {},
        config: {}
      };

      // Map context variables to data.vars
      for (const [key, values] of Object.entries(context.variables)) {
        data.vars[key] = values.length === 1 ? values[0] : values;
      }

      // Map previous outputs to data.steps
      for (const [stepId, outputs] of Object.entries(context.previousOutputs)) {
        data.steps[stepId] = {
          output: outputs,
          stdout: outputs.join('\n'),
          exitCode: outputs.length > 0 ? 0 : 1 // Heuristic fallback
        };
      }
    }

    try {
      return !!evaluateExpression(condition, data);
    } catch (e) {
      console.error(`Expression evaluation failed for condition: "${condition}"`, e);
      return false;
    }
  }

  async function handleOpenCli(step: Step, options: ExecutorOptions, context: ExecutionContext, _executeStep: ExecuteStepFn, startTime: number): Promise<ExecutionResult> {
    const site = interpolateString(step.site || '', context);
    const command = interpolateString(step.command || '', context);
    const args = (step.args || []).map((arg: string) => interpolateString(arg, context));

    const fullArgs = [site, command, ...args];

    const detection = detector.detect('opencli');

    audit.sandboxDetect(
      `opencli ${site} ${command}`,
      detection.isDangerous,
      detection.level || 'none',
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

  async function handleForEach(step: Step, options: ExecutorOptions, context: ExecutionContext, executeStep: ExecuteStepFn, startTime: number): Promise<ExecutionResult> {
    const itemsStr = interpolateString(step.items || '', context);
    const items = itemsStr.split('\n').filter(Boolean);
    const outputs: string[] = [];

    for (const item of items) {
      const itemContext: ExecutionContext = {
        ...context,
        variables: { ...context.variables, item: [item] },
      };

      for (const bodyStep of step.body || []) {
        const interpolatedStep = interpolateStep(bodyStep, itemContext);
        const result = await executeStep(interpolatedStep, options, itemContext);
        if (result.output) outputs.push(...result.output);

        if (result.status === 'FAILED') {
          return {
            stepId: step.id,
            status: 'FAILED',
            output: outputs,
            iterations: items.indexOf(item) + 1,
            duration: Date.now() - startTime,
          };
        }
      }
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      output: outputs,
      iterations: items.length,
      duration: Date.now() - startTime,
    };
  }

  async function handleIf(step: Step, options: ExecutorOptions, context: ExecutionContext, executeStep: ExecuteStepFn, startTime: number): Promise<ExecutionResult> {
    const condition = interpolateString(step.condition || '', context);
    const conditionMet = evaluateCondition(condition, context);
    const outputs: string[] = [];

    if (conditionMet && step.body) {
      for (const bodyStep of step.body) {
        const result = await executeStep(bodyStep, options, context);
        if (result.output) outputs.push(...result.output);
        if (result.status === 'FAILED') {
          return {
            stepId: step.id,
            status: 'FAILED',
            output: outputs,
            duration: Date.now() - startTime,
          };
        }
      }
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      output: outputs,
      duration: Date.now() - startTime,
    };
  }

  async function handleParallel(step: Step, options: ExecutorOptions, context: ExecutionContext, executeStep: ExecuteStepFn, startTime: number): Promise<ExecutionResult> {
    const promises = (step.body || []).map(bodyStep =>
      executeStep(bodyStep, options, context)
    );
    const results = await Promise.all(promises);
    const hasFailed = results.some(r => r.status === 'FAILED');
    const outputs = results.flatMap(r => r.output || []);

    return {
      stepId: step.id,
      status: hasFailed ? 'FAILED' : 'COMPLETED',
      output: outputs,
      iterations: results.length,
      duration: Date.now() - startTime,
    };
  }

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

    // Default fallback for legacy or unknown types (e.g. older YAMLs without explicit type)
    if (step.cli && !step.type) {
      return stepHandlers.exec(step, options, context, executeStep, startTime);
    }

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
