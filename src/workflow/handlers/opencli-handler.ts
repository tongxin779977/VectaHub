import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import { interpolateString } from '../interpolation.js';

export const createOpenCliHandler = (deps: {
  detector: any;
  audit: any;
  sandboxManager?: any;
  exec: any;
  execInSandbox: any;
}): StepHandler => {
  return async (
    step: Step,
    options: ExecutorOptions,
    context: ExecutionContext,
    executeStep: ExecuteStepFn,
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
      const storageKey = (step as any).outputVar || step.id;
      context.previousOutputs[storageKey] = outputs;

      return {
        stepId: step.id,
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: outputs,
        error: result.success ? undefined : result.stderr,
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
