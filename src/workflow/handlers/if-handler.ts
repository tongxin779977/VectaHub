import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import { interpolateString } from '../interpolation.js';

function evaluateCondition(condition: string, context: ExecutionContext): boolean {
  const exitCodeMatch = condition.match(/\$\{(\w+)\.exitCode\}\s*==\s*0/);
  if (exitCodeMatch) {
    const stepId = exitCodeMatch[1];
    const outputs = context.previousOutputs[stepId];
    return outputs !== undefined; // In dry-run we assume success for condition tests
  }

  const eqMatch = condition.match(/(\w+)\s*==\s*(.+)/);
  if (eqMatch) {
    const [, varName, expectedValue] = eqMatch;
    const actualValue = context.variables[varName]?.[0];
    return actualValue?.trim() === expectedValue.trim();
  }

  return false;
}

export const handleIf: StepHandler = async (
  step: Step,
  options: ExecutorOptions,
  context: ExecutionContext,
  executeStep: ExecuteStepFn,
  startTime: number
): Promise<ExecutionResult> => {
  const condition = interpolateString(step.condition || '', context);
  const conditionMet = evaluateCondition(condition, context);
  const outputs: string[] = [];

  if (conditionMet && step.body) {
    for (const bodyStep of step.body) {
      const result = await executeStep(bodyStep, options, context);
      if (result.output) outputs.push(...result.output);
      if (result.status === 'FAILED') {
        return {
          stepId: step.id,
          status: 'FAILED',
          output: outputs,
          duration: Date.now() - startTime,
        };
      }
    }
  }

  return {
    stepId: step.id,
    status: 'COMPLETED',
    output: outputs,
    duration: Date.now() - startTime,
  };
};
