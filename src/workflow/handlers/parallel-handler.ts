import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';

export const handleParallel: StepHandler = async (
  step: Step,
  options: ExecutorOptions,
  context: ExecutionContext,
  executeStep: ExecuteStepFn,
  startTime: number
): Promise<ExecutionResult> => {
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
};
