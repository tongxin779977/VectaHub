import { describe, it, expect } from 'vitest';
import { evaluateExpression, type ExpressionData } from './expression-engine.js';

describe('Expression Engine - Enhanced Logic', () => {
  const data: ExpressionData = {
    steps: {
      step1: {
        output: ['hello'],
        stdout: 'hello',
        exitCode: 0
      },
      step2: {
        output: [],
        exitCode: 1,
        stderr: 'error'
      }
    },
    env: {
      NODE_ENV: 'test'
    },
    vars: {
      count: 10,
      enabled: true,
      tags: ['a', 'b']
    },
    config: {}
  };

  it('should support AND logic', () => {
    expect(evaluateExpression('steps.step1.exitCode == 0 && vars.count > 5', data)).toBe(true);
    expect(evaluateExpression('steps.step1.exitCode == 0 && vars.count < 5', data)).toBe(false);
  });

  it('should support OR logic', () => {
    expect(evaluateExpression('steps.step2.exitCode == 0 || vars.enabled == true', data)).toBe(true);
    expect(evaluateExpression('steps.step2.exitCode == 1 && (vars.count > 20 || env.NODE_ENV == "test")', data)).toBe(true);
  });

  it('should support comparison operators', () => {
    expect(evaluateExpression('vars.count >= 10', data)).toBe(true);
    expect(evaluateExpression('vars.count < 20', data)).toBe(true);
    expect(evaluateExpression('vars.count != 0', data)).toBe(true);
  });

  it('should support NOT operator', () => {
    expect(evaluateExpression('!steps.step2.exitCode == 0', data)).toBe(true);
  });

  it('should handle complex nesting (if implemented)', () => {
    // Basic support for parentheses would be good
    expect(evaluateExpression('(vars.count > 5 && env.NODE_ENV == "test") && steps.step1.exitCode == 0', data)).toBe(true);
  });
});
