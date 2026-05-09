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
      if (Array.isArray(variable) && variable.length > 0 && typeof variable[0] === 'object' && variable[0] !== null) {
        return JSON.stringify(variable[0]);
      }
      return Array.isArray(variable) ? variable.join('\n') : String(variable);
    }

    if (expression.includes('.')) {
      const dotIdx = expression.indexOf('.');
      const varName = expression.substring(0, dotIdx);
      const path = expression.substring(dotIdx + 1);

      const prevOutput = context.previousOutputs[varName];
      if (prevOutput && prevOutput.length > 0) {
        if (path === 'stdout') {
          return prevOutput.join('\n');
        }
        return prevOutput[0];
      }

      const root = context.variables[varName];
      if (root && root.length > 0) {
        let current: unknown = root[0];
        const parts = path.split('.');
        for (const part of parts) {
          if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            current = undefined;
            break;
          }
        }
        if (current !== undefined) {
          return typeof current === 'object' ? JSON.stringify(current) : String(current);
        }
      }
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
