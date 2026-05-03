import { describe, it, expect } from 'vitest';
import { safeInterpolate } from './safe-interpolate.js';

describe('safeInterpolate', () => {
  it('should interpolate variables correctly', () => {
    const template = 'Hello ${name}';
    const variables = { name: 'World' };
    expect(safeInterpolate(template, variables)).toBe('Hello \'World\'');
  });

  it('should escape shell metachars by default', () => {
    const template = 'Run ${command}';
    const variables = { command: 'rm -rf /' };
    expect(safeInterpolate(template, variables)).toBe('Run \'rm -rf /\'');
  });

  it('should allow shell metachars when enable', () => {
    const template = 'Run ${command}';
    const variables = { command: 'rm -rf /' };
    expect(safeInterpolate(template, variables, { allowShellMetachars: true })).toBe('Run \'rm -rf /\'');
  });

  it('should throw error when variable exceeds maxLength', () => {
    const template = '${longVar}';
    const variables = { longVar: 'a'.repeat(1001) };
    expect(() => safeInterpolate(template, variables)).toThrow('Variable "longVar" exceeds maximum length');
  });

  it('should use custom maxLength when provided', () => {
    const template = '${var}';
    const variables = { var: 'a'.repeat(10) };
    expect(safeInterpolate(template, variables, { maxLength: 20 })).toBe('\'aaaaaaaaaa\'');
  });

  it('should throw error when variable contains invalid characters', () => {
    const template = '${var}';
    const variables = { var: 'invalid!@#$' };
    expect(() => safeInterpolate(template, variables)).toThrow('Variable "var" contains invalid characters');
  });

  it('should allow custom allowed chars regex', () => {
    const template = '${var}';
    const variables = { var: 'valid!@#' };
    expect(safeInterpolate(template, variables, { allowedChars: /^[a-z!@#]+$/i })).toBe('\'valid!@#\'');
  });

  it('should leave unmatched variables as-is', () => {
    const template = 'Hello ${name}, ${unmatched}';
    const variables = { name: 'World' };
    expect(safeInterpolate(template, variables)).toBe('Hello \'World\', ${unmatched}');
  });

  it('should handle empty variables', () => {
    const template = '${empty}';
    const variables = { empty: '' };
    expect(safeInterpolate(template, variables)).toBe('\'\'');
  });

  it('should handle single quotes in variables', () => {
    const template = '${quote}';
    const variables = { quote: 'it\'s me' };
    expect(safeInterpolate(template, variables)).toBe('\'it\'\\\'\'s me\'');
  });

  it('should interpolate multiple variables', () => {
    const template = '${greeting} ${name}';
    const variables = { greeting: 'Hello', name: 'Alice' };
    expect(safeInterpolate(template, variables)).toBe('\'Hello\' \'Alice\'');
  });
});
