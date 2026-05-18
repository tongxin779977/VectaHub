import jsonLogic from 'json-logic-js';

export interface ExpressionData {
  steps: Record<string, {
    output: unknown;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  }>;
  env: Record<string, string>;
  vars: Record<string, unknown>;
  config: Record<string, unknown>;
}

/** 表达式求值结果类型 */
export type ExpressionResult = boolean | number | string | null | unknown[] | object | undefined;

/** JsonLogic 表达式对象 */
export type JsonLogicExpression = object;

/**
 * Evaluates an expression against the provided data.
 * Supports:
 * 1. JsonLogic objects
 * 2. JsonLogic JSON strings
 * 3. Infix expressions (e.g., "steps.s1.exitCode == 0 && vars.count > 5")
 */
export function evaluateExpression(expression: string | object, data: ExpressionData): ExpressionResult {
  if (typeof expression === 'object') {
    return jsonLogic.apply(expression, data) as ExpressionResult;
  }

  const trimmed = expression.trim();
  if (trimmed.startsWith('{')) {
    try {
      const logic = JSON.parse(trimmed);
      return jsonLogic.apply(logic, data) as ExpressionResult;
    } catch (e) {
      throw new Error(`Invalid JsonLogic JSON string: ${(e as Error).message}`, { cause: e });
    }
  }

  // Handle infix expression or simple path
  try {
    const logic = parseInfixToLogic(trimmed);
    return jsonLogic.apply(logic, data) as ExpressionResult;
  } catch (e) {
    // If it looks like a simple path but isn't a valid infix, try resolving it directly
    // This maintains support for "vars.enabled" style simple paths if infix parser fails
    // But we only do this if the infix parser explicitly failed on something that doesn't look like a complex expression
    if (trimmed.includes(' ') || trimmed.includes('(') || trimmed.includes('&') || trimmed.includes('|')) {
      throw new Error(`Invalid expression syntax: ${(e as Error).message}`, { cause: e });
    }
    
    const resolved = resolveValue(trimmed, data);
    if (resolved === undefined && trimmed.includes('.')) {
      throw new Error(`Failed to resolve path or parse expression: ${trimmed}`, { cause: e });
    }
    return resolved;
  }
}

/**
 * Simple recursive descent parser to convert infix expressions to JsonLogic.
 * Supports: &&, ||, ==, !=, >, <, >=, <=, !, ()
 */
function parseInfixToLogic(expression: string): JsonLogicExpression {
  const tokens = tokenize(expression);
  if (tokens.length === 0) {
    throw new Error('Empty expression');
  }
  
  let pos = 0;

  function parseExpression(): JsonLogicExpression {
    return parseOr();
  }

  function parseOr(): JsonLogicExpression {
    let left = parseAnd();
    while (pos < tokens.length && tokens[pos] === '||') {
      pos++;
      const right = parseAnd();
      left = { "or": [left, right] };
    }
    return left;
  }

  function parseAnd(): JsonLogicExpression {
    let left = parseNot();
    while (pos < tokens.length && tokens[pos] === '&&') {
      pos++;
      const right = parseNot();
      left = { "and": [left, right] };
    }
    return left;
  }

  function parseNot(): JsonLogicExpression {
    if (tokens[pos] === '!') {
      pos++;
      return { "!": [parseComparison()] };
    }
    return parseComparison();
  }

  function parseComparison(): JsonLogicExpression {
    const left = parsePrimary();
    const ops = ['==', '!=', '>', '<', '>=', '<='];
    if (pos < tokens.length && ops.includes(tokens[pos])) {
      const op = tokens[pos++];
      const right = parsePrimary();
      return { [op]: [left, right] } as JsonLogicExpression;
    }
    return left as JsonLogicExpression;
  }

  function parsePrimary(): JsonLogicExpression | ExpressionResult {
    if (pos >= tokens.length) {
      throw new Error('Unexpected end of expression');
    }
    
    const token = tokens[pos++];
    if (token === '(') {
      const expr = parseExpression();
      if (pos >= tokens.length || tokens[pos++] !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      return expr;
    }

    // Is it a constant?
    const constant = parseConstant(token);
    if (typeof constant !== 'string' || !token.includes('.')) {
      if (token === 'true' || token === 'false' || token === 'null' || !isNaN(Number(token)) || (token.startsWith('"') || token.startsWith("'"))) {
        return constant as ExpressionResult;
      }
    }

    // Treat as variable path
    return { "var": token };
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token at position ${pos}: ${tokens[pos]}`);
  }
  return result;
}

function tokenize(str: string): string[] {
  const regex = /\s*(&&|\|\||==|!=|>=|<=|[()!><]|[^\s()!><&|]+)\s*/g;
  const tokens: string[] = [];
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (match[1]) tokens.push(match[1]);
  }
  return tokens;
}

function resolveValue(path: string, data: ExpressionData): ExpressionResult {
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current as ExpressionResult;
}

function parseConstant(val: string): ExpressionResult {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  if (!isNaN(Number(val)) && val.length > 0) return Number(val);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.substring(1, val.length - 1);
  }
  return val;
}
