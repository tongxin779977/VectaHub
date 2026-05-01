import { spawn } from 'child_process';
import type { Step, ExecutionStatus, SandboxMode } from '../types/index.js';
import { createDetector, type Detector } from '../sandbox/detector.js';

export interface ExecutorOptions {
  mode: SandboxMode;
  timeout?: number;
  dryRun?: boolean;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  stepId: string;
  status: ExecutionStatus;
  output?: string[];
  error?: string;
  duration?: number;
}

export interface CLIResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface Executor {
  exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult>;
  execute(step: Step, options?: ExecutorOptions): Promise<ExecutionResult>;
  executeWorkflow(steps: Step[], options?: ExecutorOptions): Promise<ExecutionResult[]>;
  validateStep(step: Step): { valid: boolean; errors: string[] };
}

export function createExecutor(): Executor {
  const detector: Detector = createDetector();

  async function exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = spawn(cli, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        timeout: options.timeout,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
        });
      });

      child.on('error', (err) => {
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

  return {
    exec,

    async execute(step: Step, options: ExecutorOptions = { mode: 'STRICT' }): Promise<ExecutionResult> {
      const startTime = Date.now();

      if (options.dryRun) {
        return {
          stepId: step.id,
          status: 'COMPLETED',
          output: [`[DRY RUN] Would execute: ${step.cli} ${step.args?.join(' ')}`],
          duration: Date.now() - startTime,
        };
      }

      const validation = this.validateStep(step);
      if (!validation.valid) {
        return {
          stepId: step.id,
          status: 'FAILED',
          error: validation.errors.join(', '),
          duration: Date.now() - startTime,
        };
      }

      if (step.cli) {
        const detection = detector.detect(step.cli);

        if (detection.isDangerous && options.mode === 'STRICT') {
          return {
            stepId: step.id,
            status: 'FAILED',
            error: `Dangerous command blocked: ${detection.reason}`,
            duration: Date.now() - startTime,
          };
        }

        const result = await exec(step.cli, step.args || [], options);

        return {
          stepId: step.id,
          status: result.success ? 'COMPLETED' : 'FAILED',
          output: result.stdout ? [result.stdout] : undefined,
          error: result.success ? undefined : result.stderr,
          duration: Date.now() - startTime,
        };
      }

      return {
        stepId: step.id,
        status: 'COMPLETED',
        duration: Date.now() - startTime,
      };
    },

    async executeWorkflow(steps: Step[], options: ExecutorOptions = { mode: 'STRICT' }): Promise<ExecutionResult[]> {
      const results: ExecutionResult[] = [];

      for (const step of steps) {
        const result = await this.execute(step, options);
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

      if (!['exec', 'for_each', 'if', 'parallel'].includes(step.type)) {
        errors.push(`Invalid step type: ${step.type}`);
      }

      if (step.type === 'exec' && !step.cli) {
        errors.push('exec step must have a cli command');
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