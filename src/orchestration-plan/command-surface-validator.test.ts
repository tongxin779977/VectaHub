import { describe, it, expect } from 'vitest';
import {
  validateCommandInvocation,
  validateCommandInvocations,
} from './command-surface-validator.js';

describe('command-surface-validator', () => {
  describe('validateCommandInvocation', () => {
    it('should validate a valid vectahub command with string array args', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: ['run', '--help'],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject empty cli', () => {
      const result = validateCommandInvocation({
        cli: '',
        args: ['run'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'empty_cli')).toBe(true);
    });

    it('should reject args that are not an array', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: 'run --help' as any, // Intentionally wrong type
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_args_type')).toBe(true);
    });

    it('should reject unknown vectahub commands', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: ['unknown-command'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'unknown_command')).toBe(true);
    });

    it('should validate valid config subcommands', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: ['config', 'show'],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject unknown config subcommands', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: ['config', 'unknown-subcommand'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'unknown_subcommand')).toBe(true);
    });

    it('should validate valid dev subcommands', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: ['dev', 'status'],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject args with non-string elements', () => {
      const result = validateCommandInvocation({
        cli: 'vectahub',
        args: ['run', 123 as any], // Intentionally wrong type
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_arg_type')).toBe(true);
    });

    it('should allow non-vectahub commands (like git, npm, etc.)', () => {
      const result = validateCommandInvocation({
        cli: 'git',
        args: ['status'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCommandInvocations', () => {
    it('should validate multiple valid commands', () => {
      const result = validateCommandInvocations([
        { cli: 'vectahub', args: ['run'] },
        { cli: 'git', args: ['status'] },
      ]);
      expect(result.valid).toBe(true);
    });

    it('should collect errors from multiple commands', () => {
      const result = validateCommandInvocations([
        { cli: 'vectahub', args: ['unknown'] },
        { cli: '', args: [] },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
