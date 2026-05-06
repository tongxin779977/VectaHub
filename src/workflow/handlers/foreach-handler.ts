import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import { interpolateString, interpolateStep } from '../interpolation.js';

export const handleForEach: StepHandler = async (
  step: Step,
  options: ExecutorOptions,
  context: ExecutionContext,
  executeStep: ExecuteStepFn,
  startTime: number
): Promise<ExecutionResult> => {
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
};
