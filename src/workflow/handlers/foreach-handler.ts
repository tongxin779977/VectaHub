import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import { interpolateString, interpolateStep } from '../interpolation.js';
import { getLogger } from '../../infrastructure/logger/index.js';

const moduleLogger = getLogger('foreach-handler');

export const handleForEach: StepHandler = async (
  step: Step,
  options: ExecutorOptions,
  context: ExecutionContext,
  executeStep: ExecuteStepFn,
  startTime: number
): Promise<ExecutionResult> => {
  const itemsStr = interpolateString(step.items || '', context);
  const outputs: string[] = [];

  let parsedItems: unknown[] | null = null;
  const trimmed = itemsStr.trim();
  if (trimmed.startsWith('[')) {
    try {
      parsedItems = JSON.parse(trimmed);
      if (!Array.isArray(parsedItems)) parsedItems = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      moduleLogger.debug({ error: message, input: trimmed.slice(0, 100) }, 'for_each items JSON parse failed');
      parsedItems = null;
    }
  }

  if (parsedItems) {
    for (const parsedItem of parsedItems) {
      const itemContext: ExecutionContext = {
        ...context,
        variables: { ...context.variables, item: [parsedItem as unknown] as unknown as string[] },
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
            iterations: parsedItems.indexOf(parsedItem) + 1,
            duration: Date.now() - startTime,
          };
        }
      }
    }

    return {
      stepId: step.id,
      status: 'COMPLETED',
      output: outputs,
      iterations: parsedItems.length,
      duration: Date.now() - startTime,
    };
  }

  const items = itemsStr.split('\n').filter(Boolean);

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
