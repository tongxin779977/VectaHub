import type { Step } from '../types/index.js';

export interface InterpolationContext {
  variables: Record<string, string[]>;
  previousOutputs: Record<string, string[]>;
}

const VAR_REGEX = /\$\{([^}]+)\}/g;

export function interpolateString(
  template: string,
  context: InterpolationContext
): string {
  if (typeof template !== 'string') return template ?? '';
  return template.replace(VAR_REGEX, (_, varName: string) => {
    const output = context.previousOutputs[varName];
    if (output) {
      return Array.isArray(output) ? output.join('\n') : String(output);
    }
    const variable = context.variables[varName];
    if (variable) {
      return Array.isArray(variable) ? variable.join('\n') : String(variable);
    }
    return `\${${varName}}`;
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
