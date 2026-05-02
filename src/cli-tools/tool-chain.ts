import { spawn } from 'child_process';
import type { ToolStep, ToolChainResult, CliToolRegistry, CliToolResult } from './types.js';

const DEFAULT_TIMEOUT = 60000;

export interface ToolChain {
  addStep(step: ToolStep): ToolChain;
  addSteps(steps: ToolStep[]): ToolChain;
  setContext(key: string, value: any): ToolChain;
  getContext(): Record<string, any>;
  clear(): ToolChain;
  execute(): Promise<ToolChainResult>;
}

export function createToolChain(registry: CliToolRegistry): ToolChain {
  const steps: ToolStep[] = [];
  let context: Record<string, any> = {};

  async function executeStep(
    step: ToolStep,
    currentContext: Record<string, any>
  ): Promise<CliToolResult> {
    const startTime = Date.now();
    const options = step.options || {};
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    const tool = registry.getTool(step.tool);
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Tool "${step.tool}" not found in registry`,
        exitCode: -1,
        duration: Date.now() - startTime,
        context: currentContext,
      };
    }

    return new Promise((resolve) => {
      const child = spawn(step.tool, step.args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
      });

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
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr || undefined,
          exitCode: code || 0,
          duration: Date.now() - startTime,
          context: { ...currentContext },
        });
      });

      child.on('error', (err) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve({
          success: false,
          output: stdout,
          error: err.message,
          exitCode: -1,
          duration: Date.now() - startTime,
          context: { ...currentContext },
        });
      });
    });
  }

  return {
    addStep(step: ToolStep): ToolChain {
      steps.push(step);
      return this;
    },

    addSteps(newSteps: ToolStep[]): ToolChain {
      steps.push(...newSteps);
      return this;
    },

    setContext(key: string, value: any): ToolChain {
      context[key] = value;
      return this;
    },

    getContext(): Record<string, any> {
      return { ...context };
    },

    clear(): ToolChain {
      steps.length = 0;
      context = {};
      return this;
    },

    async execute(): Promise<ToolChainResult> {
      const startTime = Date.now();
      const results: CliToolResult[] = [];
      let currentContext = { ...context };

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        try {
          const result = await executeStep(step, currentContext);
          results.push(result);
          
          if (result.context) {
            currentContext = { ...currentContext, ...result.context };
          }
          
          if (!result.success) {
            return {
              success: false,
              results,
              totalDuration: Date.now() - startTime,
              context: currentContext,
              error: result.error || `Step ${i + 1} failed`,
              failedStep: i,
            };
          }
        } catch (err) {
          const duration = Date.now() - startTime;
          return {
            success: false,
            results,
            totalDuration: duration,
            context: currentContext,
            error: err instanceof Error ? err.message : String(err),
            failedStep: i,
          };
        }
      }

      return {
        success: true,
        results,
        totalDuration: Date.now() - startTime,
        context: currentContext,
      };
    },
  };
}
