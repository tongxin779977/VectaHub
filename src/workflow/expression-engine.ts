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

/**
 * Evaluates an expression against the provided data.
 * Supports:
 * 1. JsonLogic objects
 * 2. JsonLogic JSON strings
 * 3. Infix expressions (e.g., "steps.s1.exitCode == 0 && vars.count > 5")
 */
export function evaluateExpression(expression: string | object, data: ExpressionData): any {
  if (typeof expression === 'object') {
    return jsonLogic.apply(expression, data);
  }

  const trimmed = expression.trim();
  if (trimmed.startsWith('{')) {
    try {
      const logic = JSON.parse(trimmed);
      return jsonLogic.apply(logic, data);
    } catch (e) {
      // Ignore parse error and try as simple expression
    }
  }

  try {
    const logic = parseInfixToLogic(trimmed);
    return jsonLogic.apply(logic, data);
  } catch (e) {
    // Fallback to basic value resolution if parsing fails
    return resolveValue(trimmed, data);
  }
}

/**
 * Simple recursive descent parser to convert infix expressions to JsonLogic.
 * Supports: &&, ||, ==, !=, >, <, >=, <=, !, ()
 */
function parseInfixToLogic(expression: string): any {
  const tokens = tokenize(expression);
  let pos = 0;

  function parseExpression(): any {
    return parseOr();
  }

  function parseOr(): any {
    let left = parseAnd();
    while (pos < tokens.length && tokens[pos] === '||') {
      pos++;
      const right = parseAnd();
      left = { "or": [left, right] };
    }
    return left;
  }

  function parseAnd(): any {
    let left = parseNot();
    while (pos < tokens.length && tokens[pos] === '&&') {
      pos++;
      const right = parseNot();
      left = { "and": [left, right] };
    }
    return left;
  }

  function parseNot(): any {
    if (tokens[pos] === '!') {
      pos++;
      return { "!": [parseComparison()] };
    }
    return parseComparison();
  }

  function parseComparison(): any {
    let left = parsePrimary();
    const ops = ['==', '!=', '>', '<', '>=', '<='];
    if (pos < tokens.length && ops.includes(tokens[pos])) {
      const op = tokens[pos++];
      const right = parsePrimary();
      return { [op]: [left, right] };
    }
    return left;
  }

  function parsePrimary(): any {
    const token = tokens[pos++];
    if (token === '(') {
      const expr = parseExpression();
      if (tokens[pos++] !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      return expr;
    }

    // Is it a constant?
    const constant = parseConstant(token);
    if (typeof constant !== 'string' || !token.includes('.')) {
      // If it's a known constant or doesn't look like a path, treat as constant
      // Note: This is simplified. Path detection could be more robust.
      if (token === 'true' || token === 'false' || token === 'null' || !isNaN(Number(token)) || (token.startsWith('"') || token.startsWith("'"))) {
        return constant;
      }
    }

    // Treat as variable path
    return { "var": token };
  }

  return parseExpression();
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

function resolveValue(path: string, data: ExpressionData): any {
  const parts = path.split('.');
  let current: any = data;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function parseConstant(val: string): any {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  if (!isNaN(Number(val)) && val.length > 0) return Number(val);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.substring(1, val.length - 1);
  }
  return val;
}
