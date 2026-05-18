import { describe, it, expect } from 'vitest';
import { evaluateExpression, type ExpressionData } from './expression-engine.js';

describe('Expression Engine', () => {
  const data: ExpressionData = {
    steps: {
      step1: {
        output: ['hello', 'world'],
        stdout: 'hello\nworld',
        exitCode: 0
      },
      step2: {
        output: [],
        exitCode: 1,
        stderr: 'error occurred'
      }
    },
    env: {
      NODE_ENV: 'test',
      PATH: '/usr/bin'
    },
    vars: {
      count: 5,
      enabled: true,
      name: 'VectaHub'
    },
    config: {}
  };

  it('should evaluate simple infix equality', () => {
    expect(evaluateExpression('steps.step1.exitCode == 0', data)).toBe(true);
    expect(evaluateExpression('steps.step2.exitCode == 0', data)).toBe(false);
    expect(evaluateExpression('vars.count == 5', data)).toBe(true);
    expect(evaluateExpression('env.NODE_ENV == "test"', data)).toBe(true);
  });

  it('should evaluate truthiness', () => {
    expect(evaluateExpression('vars.enabled', data)).toBe(true);
    expect(evaluateExpression('steps.step1.stdout', data)).toBeTruthy();
    expect(evaluateExpression('steps.step2.stderr', data)).toBeTruthy();
  });

  it('should evaluate json-logic object', () => {
    const logic = {
      "and": [
        { "==": [{ "var": "steps.step1.exitCode" }, 0] },
        { ">": [{ "var": "vars.count" }, 3] }
      ]
    };
    expect(evaluateExpression(logic, data)).toBe(true);
  });

  it('should evaluate json-logic string', () => {
    const logicStr = JSON.stringify({
      "==": [{ "var": "env.PATH" }, "/usr/bin"]
    });
    expect(evaluateExpression(logicStr, data)).toBe(true);
  });

  describe('error handling', () => {
    it('should throw on invalid JSON logic string', () => {
      expect(() => evaluateExpression('{"and": [}', data)).toThrow('Invalid JsonLogic JSON string');
    });

    it('should throw on malformed infix expression', () => {
      expect(() => evaluateExpression('steps.s1.exitCode ==', data)).toThrow('Unexpected end of expression');
      expect(() => evaluateExpression('vars.count >> 5', data)).toThrow('Unexpected token at position 3: 5');
    });

    it('should throw on missing parenthesis', () => {
      expect(() => evaluateExpression('(vars.count > 0', data)).toThrow('Missing closing parenthesis');
    });

    it('should return null on non-existent path (truthiness support)', () => {
      expect(evaluateExpression('vars.nonexistent.field', data)).toBeNull();
    });
  });
});
