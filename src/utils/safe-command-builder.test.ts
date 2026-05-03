import { describe, it, expect } from 'vitest';
import { SafeCommandBuilder } from './safe-command-builder.js';

describe('SafeCommandBuilder', () => {
  it('should create a builder with a valid command', () => {
    const builder = new SafeCommandBuilder('ls');
    expect(builder).toBeDefined();
  });

  it('should throw error for invalid commands', () => {
    expect(() => new SafeCommandBuilder('rm')).toThrowError('Command "rm" is not allowed');
  });

  it('should add a single argument', () => {
    const builder = new SafeCommandBuilder('ls');
    const result = builder.addArg('-la').build();
    expect(result).toEqual({ command: 'ls', args: ['-la'] });
  });

  it('should add multiple arguments', () => {
    const builder = new SafeCommandBuilder('git');
    const result = builder.addArg('status').addArg('--short').build();
    expect(result).toEqual({ command: 'git', args: ['status', '--short'] });
  });

  it('should escape special characters in arguments', () => {
    const builder = new SafeCommandBuilder('echo');
    const result = builder.addArg('hello "world" and \'test\'').build();
    expect(result.args).toEqual(['hello \\"world\\" and \\\'test\\\'']);
  });
});