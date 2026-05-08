import type { Step } from '../types/index.js';
import { evaluateExpression } from './expression-engine.js';
import { contextManager } from './context-manager.js';

export interface InterpolationContext {
  variables: Record<string, string[]>;
  previousOutputs: Record<string, string[]>;
  executionId?: string;
}

const VAR_REGEX = /\$\{([^}]+)\}/g;

export function interpolateString(
  template: string,
  context: InterpolationContext
): string {
  if (typeof template !== 'string') return template ?? '';
  return template.replace(VAR_REGEX, (match, expression: string) => {
    // 1. Try legacy variable lookup first for backward compatibility
    const output = context.previousOutputs[expression];
    if (output) {
      return Array.isArray(output) ? output.join('\n') : String(output);
    }
    const variable = context.variables[expression];
    if (variable) {
      return Array.isArray(variable) ? variable.join('\n') : String(variable);
    }

    // 2. Try complex expression evaluation if executionId is available
    if (context.executionId) {
      try {
        const data = contextManager.getExpressionData(context.executionId);
        const result = evaluateExpression(expression, data);
        if (result !== undefined && result !== null) {
          return String(result);
        }
      } catch (e) {
        // Fallback to original match if evaluation fails
      }
    }

    return match;
  });
}

export function interpolateStep(step: Step, context: InterpolationContext): Step {
  return {
    ...step,
    cli: step.cli ? interpolateString(step.cli, context) : undefined,
    args: step.args?.map(arg => interpolateString(arg, context)),
    condition: step.condition ? interpolateString(step.condition, context) : undefined,
    site: step.site ? interpolateString(step.site, context) : undefined,
    command: step.command ? interpolateString(step.command, context) : undefined,
  };
}
