import { spawn, ChildProcess } from 'child_process';
import type { Step, ExecutionStatus, SandboxMode } from '../types/index.js';
import { createDetector, type Detector } from '../sandbox/detector.js';
import { createSandboxManager, type SandboxManager } from '../sandbox/sandbox.js';
import { audit } from '../utils/audit.js';
import { delegateExecutor } from './ai-delegate.js';
import { EnvironmentDetector } from './ai-env-detector.js';
import { ProviderRegistry } from './ai-provider-registry.js';
import { FallbackStrategy } from './ai-fallback-strategy.js';
import { loadAIConfig } from '../utils/ai-config.js';

const DEFAULT_TIMEOUT = 60000;

export interface ExecutorOptions {
  mode: SandboxMode;
  timeout?: number;
  dryRun?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  useSandbox?: boolean;
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

    return new Promise((resolve) => {
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
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr: err.message,
          duration: Date.now() - startTime,
        });
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

  function interpolateString(template: string, context: ExecutionContext): string {
    if (typeof template !== 'string') return template ?? '';
    return template.replace(/\$\{(\w+)(?:\.(\w+))?\}/g, (match, varName) => {
      const outputs = context.previousOutputs[varName];
      return outputs ? outputs.join('\n') : match;
    });
  }

  function interpolateStep(step: Step, context: ExecutionContext): Step {
    const interpolated = { ...step };

    if (step.cli) {
      interpolated.cli = interpolateString(step.cli, context);
    }

    if (step.args) {
      interpolated.args = step.args.map(arg => interpolateString(arg, context));
    }

    if (step.condition) {
      interpolated.condition = interpolateString(step.condition, context);
    }

    return interpolated;
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

  async function executeStep(step: Step, options: ExecutorOptions, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (step.type === 'delegate') {
      return executeDelegateStep(step, options, context, startTime);
    }

    if (step.type === 'for_each') {
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

    if (step.type === 'if') {
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

    if (step.type === 'parallel') {
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

    if (step.cli) {
      const interpolatedCli = interpolateString(step.cli, context);
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
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      duration: Date.now() - startTime,
    };
  }

  async function executeDelegateStep(
    step: Step,
    options: ExecutorOptions,
    context: ExecutionContext,
    startTime: number
  ): Promise<ExecutionResult> {
    const provider = step.delegate_to || 'built-in';
    const prompt = step.delegate_prompt || '';
    const delegateContext = step.delegate_context || {};

    try {
      const aiConfig = await loadAIConfig();

      const detector = new EnvironmentDetector();
      const envReport = await detector.scan();
      const registry = new ProviderRegistry(envReport);
      const fallback = new FallbackStrategy(registry, {
        autoFallback: aiConfig.fallback.auto_fallback,
        promptBeforeSwitch: aiConfig.fallback.prompt_before_switch,
        maxFallbackAttempts: aiConfig.fallback.max_attempts,
        timeoutMs: aiConfig.fallback.timeout_ms,
      });

      const targetProvider = await fallback.resolveProvider(provider);

      audit.workflowStep(step.id, `delegate:${targetProvider}`, [], 'unknown');

      const result = await delegateExecutor.delegate({
        provider: targetProvider as any,
        prompt,
        context: delegateContext,
      });

      if (result.output) {
        context.previousOutputs[step.id] = [result.output];
      }

      return {
        stepId: step.id,
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: result.output ? [result.output] : undefined,
        error: result.error,
        duration: result.duration,
      };
    } catch (error) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
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

      if (!step.id) {
        errors.push('Step must have an id');
      }

      if (!['exec', 'for_each', 'if', 'parallel', 'delegate'].includes(step.type)) {
        errors.push(`Invalid step type: ${step.type}`);
      }

      if (step.type === 'exec' && !step.cli) {
        errors.push('exec step must have a cli command');
      }

      if (step.type === 'delegate' && !step.delegate_prompt) {
        errors.push('delegate step must have a delegate_prompt');
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
