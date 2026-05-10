import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import { interpolateString } from '../interpolation.js';
import type { SemanticDetector } from '../../sandbox/semantic-detector.js';

export const createExecHandler = (deps: {
  detector: any;
  semanticDetector?: SemanticDetector;
  audit: any;
  sandboxManager?: any;
  exec: any;
  execInSandbox: any;
  shouldAllow: any;
}): StepHandler => {
  return async (
    step: Step,
    options: ExecutorOptions,
    context: ExecutionContext,
    executeStep: ExecuteStepFn,
    startTime: number
  ): Promise<ExecutionResult> => {
    const interpolatedCli = interpolateString(step.cli!, context);
    const interpolatedArgs = (step.args || []).map(arg => interpolateString(arg, context));
    const fullCommand = `${interpolatedCli} ${interpolatedArgs.join(' ')}`.trim();

    if (deps.semanticDetector) {
      const semanticResult = deps.semanticDetector.detectDangerousCommand(fullCommand);
      if (semanticResult.detected && (semanticResult.severity === 'critical' || semanticResult.severity === 'high')) {
        return {
          stepId: step.id,
          status: 'FAILED',
          error: `Semantic Guardrails blocked: ${semanticResult.reason}`,
          duration: Date.now() - startTime,
        };
      }
    }

    const detection = deps.detector.detect(fullCommand);

    deps.audit.sandboxDetect(
      fullCommand,
      detection.isDangerous,
      detection.level || 'none',
      'unknown'
    );

    if (!deps.shouldAllow(detection, options.mode)) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `Dangerous command blocked: ${detection.reason}`,
        duration: Date.now() - startTime,
      };
    }

    try {
      const stepOptions = {
        ...options,
        timeout: (step as any).timeout || options.timeout
      };

      const result = options.useSandbox && deps.sandboxManager
        ? await deps.execInSandbox(interpolatedCli, interpolatedArgs, stepOptions)
        : await deps.exec(interpolatedCli, interpolatedArgs, stepOptions);

      deps.audit.executorResult(
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
        error: result.success ? undefined : (result.stderr || `Command exited with code ${result.exitCode}`),
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
