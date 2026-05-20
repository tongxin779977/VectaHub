import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult, HandlerDependencies } from './types.js';
import { interpolateString } from '../interpolation.js';

export const createExecHandler = (deps: HandlerDependencies): StepHandler => {
  return async (
    step: Step,
    options: ExecutorOptions,
    context: ExecutionContext,
    _executeStep: ExecuteStepFn,
    startTime: number
  ): Promise<ExecutionResult> => {
    const interpolatedCli = interpolateString(step.cli!, context);
    const interpolatedArgs = (step.args || []).map(arg => interpolateString(arg, context));
    const fullCommand = `${interpolatedCli} ${interpolatedArgs.join(' ')}`.trim();

    if (deps.semanticDetector && typeof deps.semanticDetector.detectDangerousCommand === 'function') {
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
      options.sessionId || 'unknown'
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
      // Safely access optional timeout from step
      const stepTimeout = (step as Step & { timeout?: number }).timeout;
      const stepOptions = {
        ...options,
        timeout: stepTimeout || options.timeout
      };

      const result = options.useSandbox && deps.sandboxManager
        ? await deps.execInSandbox(interpolatedCli, interpolatedArgs, stepOptions)
        : await deps.exec(interpolatedCli, interpolatedArgs, stepOptions);

      deps.audit.executorResult(
        step.id,
        interpolatedCli,
        result.exitCode,
        result.duration,
        options.sessionId || 'unknown',
        { stdoutLength: result.stdout.length, stderrLength: result.stderr.length }
      );

      const outputs = result.stdout ? [result.stdout] : [];
      const storageKey = step.outputVar || step.id;
      context.previousOutputs[storageKey] = outputs;
      if (storageKey !== step.id) {
        context.previousOutputs[step.id] = outputs;
      }

      return {
        stepId: step.id,
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: outputs,
        error: result.success ? undefined : (result.stderr || `Command exited with code ${result.exitCode}`),
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
