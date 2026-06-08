import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandBridge, createCommandBridge } from './command-bridge.js';
import { Command } from 'commander';

describe('CommandBridge', () => {
  let program: Command;
  let bridge: CommandBridge;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    program.name('test-bridge');
    bridge = new CommandBridge(program);
  });

  it('should create CommandBridge instance', () => {
    expect(bridge).toBeDefined();
    expect(typeof bridge.execute).toBe('function');
  });

  it('should return error message for unknown command', async () => {
    const result = await bridge.execute('nonexistent');
    expect(result).toContain('❌');
  });

  it('should return a string result for empty command', async () => {
    const result = await bridge.execute('');
    expect(result).toBe('❌ Empty command.');
  });

  it('should restore process streams after execute', async () => {
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    await bridge.execute('nonexistent');
    expect(process.stdout.write).toBe(originalStdout);
    expect(process.stderr.write).toBe(originalStderr);
  });

  it('should capture output from parseAsync action', async () => {
    vi.spyOn(program, 'parseAsync').mockImplementation(async () => {
      process.stdout.write('captured output');
    });
    const result = await bridge.execute('test');
    expect(result).toBe('captured output');
    vi.restoreAllMocks();
  });

  it('should capture stderr from parseAsync action', async () => {
    vi.spyOn(program, 'parseAsync').mockImplementation(async () => {
      process.stderr.write('error output');
    });
    const result = await bridge.execute('test');
    expect(result).toBe('error output');
    vi.restoreAllMocks();
  });

  it('should return error message when parseAsync throws', async () => {
    vi.spyOn(program, 'parseAsync').mockRejectedValue(new Error('parse error'));
    const result = await bridge.execute('bad-cmd');
    expect(result).toContain('❌ Error: parse error');
    vi.restoreAllMocks();
  });

  it('should concatenate stdout and stderr output', async () => {
    vi.spyOn(program, 'parseAsync').mockImplementation(async () => {
      process.stdout.write('stdout data');
      process.stderr.write('stderr data');
    });
    const result = await bridge.execute('cmd');
    expect(result).toContain('stdout data');
    expect(result).toContain('stderr data');
    vi.restoreAllMocks();
  });

  it('should return success message when command produces no output', async () => {
    vi.spyOn(program, 'parseAsync').mockResolvedValue(undefined);
    const result = await bridge.execute('silent');
    expect(result).toContain('silent');
    expect(result).toContain('no output');
    vi.restoreAllMocks();
  });

  it('should execute registered subcommand using user argv semantics', async () => {
    program
      .command('doctor')
      .action(() => {
        process.stdout.write('doctor output');
      });

    const result = await bridge.execute('doctor');

    expect(result).toBe('doctor output');
  });
});

describe('createCommandBridge', () => {
  it('should create a CommandBridge instance', () => {
    const program = new Command();
    const bridge = createCommandBridge(program);
    expect(bridge).toBeInstanceOf(CommandBridge);
  });

  it('should create bridge with execute method', async () => {
    const program = new Command();
    program.exitOverride();
    program.name('test');
    const bridge = createCommandBridge(program);
    const result = await bridge.execute('test');
    expect(typeof result).toBe('string');
  });
});
