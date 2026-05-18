import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult, HandlerDependencies } from './types.js';
import { interpolateString } from '../interpolation.js';

export const createOpenCliHandler = (deps: HandlerDependencies): StepHandler => {
  return async (
    step: Step,
    options: ExecutorOptions,
    context: ExecutionContext,
    _executeStep: ExecuteStepFn,
    startTime: number
  ): Promise<ExecutionResult> => {
    const site = interpolateString(step.site || '', context);
    const command = interpolateString(step.command || '', context);
    const args = (step.args || []).map((arg: string) => interpolateString(arg, context));

    const fullArgs = [site, command, ...args];

    const detection = deps.detector.detect('opencli');

    deps.audit.sandboxDetect(
      `opencli ${site} ${command}`,
      detection.isDangerous,
      detection.level || 'none',
      'unknown'
    );

    try {
      const result = options.useSandbox && deps.sandboxManager
        ? await deps.execInSandbox('opencli', fullArgs, options)
        : await deps.exec('opencli', fullArgs, options);

      deps.audit.executorResult(
        step.id,
        'opencli',
        result.exitCode,
        result.duration,
        'unknown',
        { stdoutLength: result.stdout.length, stderrLength: result.stderr.length }
      );

      const outputs = result.stdout ? [result.stdout] : [];
      const storageKey = (step as Step & { outputVar?: string }).outputVar || step.id;
      context.previousOutputs[storageKey] = outputs;
      if (storageKey !== step.id) {
        context.previousOutputs[step.id] = outputs;
      }

      return {
        stepId: step.id,
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: outputs,
        error: result.success ? undefined : result.stderr,
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
        sandboxed: options.useSandbox && deps.sandboxManager ? true : undefined,
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
  };
};
