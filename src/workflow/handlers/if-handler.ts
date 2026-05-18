import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import { evaluateExpression, type ExpressionData } from '../expression-engine.js';

const RESERVED_CONDITION_ROOTS = new Set(['steps', 'vars', 'env', 'config', 'true', 'false', 'null']);

function coerceExpressionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const coerced = value.map(coerceExpressionValue);
    return coerced.length === 1 ? coerced[0] : coerced;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  return value;
}

function normalizeExpressionData(data: ExpressionData): ExpressionData {
  const steps = Object.fromEntries(
    Object.entries(data.steps).map(([stepId, stepData]) => [
      stepId,
      {
        ...stepData,
        output: coerceExpressionValue(stepData.output),
      },
    ])
  );

  const vars = Object.fromEntries(
    Object.entries(data.vars).map(([name, value]) => [name, coerceExpressionValue(value)])
  );

  return {
    ...data,
    steps,
    vars,
  };
}

function buildExpressionData(context: ExecutionContext): ExpressionData {
  const steps: ExpressionData['steps'] = {};
  for (const [stepId, outputs] of Object.entries(context.previousOutputs)) {
    steps[stepId] = {
      output: coerceExpressionValue(outputs),
      stdout: outputs.join('\n'),
    };
  }

  const vars: ExpressionData['vars'] = {};
  for (const [key, values] of Object.entries(context.variables)) {
    vars[key] = coerceExpressionValue(values);
  }

  return {
    steps,
    env: { ...process.env } as Record<string, string>,
    vars,
    config: {},
  };
}

function resolveLegacyRoot(expression: string, context: ExecutionContext): 'steps' | 'vars' {
  const root = expression.split('.', 1)[0];
  if (root in context.previousOutputs) {
    return 'steps';
  }
  if (root in context.variables) {
    return 'vars';
  }
  return 'steps';
}

function normalizeLegacyPlaceholder(expression: string, context: ExecutionContext): string {
  const trimmed = expression.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^(steps|vars|env|config)\./.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z_]\w*$/.test(trimmed)) {
    if (trimmed in context.previousOutputs) {
      return `steps.${trimmed}.output`;
    }
    return `vars.${trimmed}`;
  }

  if (/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/.test(trimmed)) {
    return `${resolveLegacyRoot(trimmed, context)}.${trimmed}`;
  }

  return normalizeLegacyCondition(trimmed, context);
}

function normalizeLegacyCondition(condition: string, context: ExecutionContext): string {
  const normalizedPlaceholders = condition.replace(/\$\{([^}]+)\}/g, (_, expression: string) =>
    normalizeLegacyPlaceholder(expression, context)
  );

  const normalizedIdentifiers = normalizedPlaceholders.replace(
    /\b([A-Za-z_]\w*)\b(?=\s*(?:==|!=|>|<|>=|<=))/g,
    (identifier: string, _: string, offset: number, source: string) => {
      const previousCharacter = offset > 0 ? source[offset - 1] : '';
      if (previousCharacter === '.' || RESERVED_CONDITION_ROOTS.has(identifier)) {
        return identifier;
      }
      return `vars.${identifier}`;
    }
  );

  return normalizedIdentifiers.replace(
    /((?:steps|vars|env|config)\.[A-Za-z_][\w.]*)\s*(==|!=)\s*([A-Za-z_][\w-]*)/g,
    (match: string, left: string, operator: string, right: string) => {
      if (right === 'true' || right === 'false' || right === 'null' || !Number.isNaN(Number(right))) {
        return match;
      }
      return `${left} ${operator} "${right}"`;
    }
  );
}

export function evaluateCondition(condition: string, context: ExecutionContext): boolean {
  const data = context.expressionData ?? buildExpressionData(context);
  const normalizedCondition = normalizeLegacyCondition(condition, context);

  try {
    return Boolean(evaluateExpression(normalizedCondition, normalizeExpressionData(data)));
  } catch (e) {
    const error = e as Error;
    // Check if it's a syntax error from expression-engine
    const isSyntaxError = error.message.includes('Invalid expression syntax') || 
                         error.message.includes('Unexpected token') ||
                         error.message.includes('Unexpected end of expression') ||
                         error.message.includes('Missing closing parenthesis');
    
    if (isSyntaxError) {
      const trimmed = condition.trim();
      
      // For formal syntax (JSON, parentheses, operators), keep throwing to avoid hiding bugs
      const isFormalSyntax = trimmed.startsWith('{') || 
                            trimmed.includes('(') || 
                            trimmed.includes(')') || 
                            /\s*(==|!=|>=|<=|>|<|&&|\|\|)\s*/.test(trimmed);
      
      if (isFormalSyntax) {
        throw e;
      }
      
      // For legacy/unknown free text condition format, skip body (return false)
      return false;
    }
    
    // For other errors (like JSON parse error which has its own message), rethrow
    throw e;
  }
}

export const handleIf: StepHandler = async (
  step: Step,
  options: ExecutorOptions,
  context: ExecutionContext,
  executeStep: ExecuteStepFn,
  startTime: number
): Promise<ExecutionResult> => {
  const conditionMet = evaluateCondition(step.condition || '', context);
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
