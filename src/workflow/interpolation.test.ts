import { describe, it, expect } from 'vitest';
import { interpolateString, interpolateStep, type InterpolationContext } from './interpolation.js';
import type { Step } from '../types/index.js';

function createContext(overrides?: Partial<InterpolationContext>): InterpolationContext {
  return {
    variables: {},
    previousOutputs: {},
    ...overrides,
  };
}

function makeStep(overrides?: Partial<Step>): Step {
  return {
    id: 'test-step',
    type: 'exec',
    cli: 'echo',
    args: ['hello'],
    ...overrides,
  };
}

describe('interpolation', () => {
  describe('interpolateString', () => {
    it('should replace ${var} with previousOutputs value', () => {
      const ctx = createContext({
        previousOutputs: { name: ['world'] },
      });
      expect(interpolateString('hello ${name}', ctx)).toBe('hello world');
    });

    it('should replace ${var} with variables value', () => {
      const ctx = createContext({
        variables: { name: ['John'] },
      });
      expect(interpolateString('hi ${name}', ctx)).toBe('hi John');
    });

    it('should prefer previousOutputs over variables', () => {
      const ctx = createContext({
        variables: { name: ['John'] },
        previousOutputs: { name: ['Jane'] },
      });
      expect(interpolateString('${name}', ctx)).toBe('Jane');
    });

    it('should join array outputs with newline', () => {
      const ctx = createContext({
        previousOutputs: { lines: ['line1', 'line2', 'line3'] },
      });
      expect(interpolateString('${lines}', ctx)).toBe('line1\nline2\nline3');
    });

    it('should join array variables with newline', () => {
      const ctx = createContext({
        variables: { items: ['a', 'b'] },
      });
      expect(interpolateString('${items}', ctx)).toBe('a\nb');
    });

    it('should leave unresolved variables as-is', () => {
      const ctx = createContext();
      expect(interpolateString('hello ${missing}', ctx)).toBe('hello ${missing}');
    });

    it('should handle multiple variables in one string', () => {
      const ctx = createContext({
        previousOutputs: { a: ['1'], b: ['2'] },
      });
      expect(interpolateString('${a} + ${b}', ctx)).toBe('1 + 2');
    });

    it('should return empty string for non-string input', () => {
      const ctx = createContext();
      expect(interpolateString(undefined as unknown as string, ctx)).toBe('');
    });

    it('should handle string with no variables', () => {
      const ctx = createContext();
      expect(interpolateString('plain text', ctx)).toBe('plain text');
    });

    it('should handle complex nested variable names', () => {
      const ctx = createContext({
        previousOutputs: { 'step1.output': ['result'] },
      });
      expect(interpolateString('${step1.output}', ctx)).toBe('result');
    });
  });

  describe('interpolateStep', () => {
    it('should interpolate cli field', () => {
      const ctx = createContext({
        previousOutputs: { cmd: ['npm'] },
      });
      const step = makeStep({ cli: '${cmd}' });
      const result = interpolateStep(step, ctx);
      expect(result.cli).toBe('npm');
    });

    it('should interpolate args fields', () => {
      const ctx = createContext({
        previousOutputs: { target: ['build'] },
      });
      const step = makeStep({ args: ['run', '${target}'] });
      const result = interpolateStep(step, ctx);
      expect(result.args).toEqual(['run', 'build']);
    });

    it('should interpolate condition field', () => {
      const ctx = createContext({
        previousOutputs: { status: ['0'] },
      });
      const step = makeStep({
        type: 'if',
        condition: '${status} == 0',
      });
      const result = interpolateStep(step, ctx);
      expect(result.condition).toBe('0 == 0');
    });

    it('should interpolate site and command for opencli', () => {
      const ctx = createContext({
        previousOutputs: { url: ['example.com'] },
      });
      const step = makeStep({
        type: 'opencli',
        site: '${url}',
        command: 'search',
      });
      const result = interpolateStep(step, ctx);
      expect(result.site).toBe('example.com');
      expect(result.command).toBe('search');
    });

    it('should preserve step id and type', () => {
      const ctx = createContext();
      const step = makeStep({ id: 'my-step', type: 'exec' });
      const result = interpolateStep(step, ctx);
      expect(result.id).toBe('my-step');
      expect(result.type).toBe('exec');
    });

    it('should handle step with undefined cli', () => {
      const ctx = createContext();
      const step = makeStep({ cli: undefined });
      const result = interpolateStep(step, ctx);
      expect(result.cli).toBeUndefined();
    });

    it('should handle step with empty args', () => {
      const ctx = createContext();
      const step = makeStep({ args: undefined });
      const result = interpolateStep(step, ctx);
      expect(result.args).toBeUndefined();
    });
  });
});
