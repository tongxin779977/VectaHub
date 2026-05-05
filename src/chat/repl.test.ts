import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRepl, parseInput } from './repl.js';
import type { ReplDeps, SlashCommandContext } from './types.js';

vi.mock('node:readline', () => {
  const rl = {
    question: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    pause: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => rl),
    __rl: rl,
  };
});

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
  })),
}));

function createMockDeps(overrides?: Partial<ReplDeps>): ReplDeps {
  return {
    nlProcessor: { parse: vi.fn().mockResolvedValue({ intent: 'test', confidence: 0.9 }) },
    contextBuilder: { buildContext: vi.fn().mockResolvedValue({ cwd: '/test' }) },
    ...overrides,
  };
}

describe('parseInput', () => {
  it('should parse shell command input', () => {
    const result = parseInput('!ls -la');
    expect(result.type).toBe('shell');
    expect(result.raw).toBe('!ls -la');
    expect(result.parsed).toBe('ls -la');
  });

  it('should parse slash command input', () => {
    const result = parseInput('/help');
    expect(result.type).toBe('slash-command');
    expect(result.raw).toBe('/help');
    expect(result.parsed).toBe('help');
    expect(result.args).toEqual([]);
  });

  it('should parse slash command with args', () => {
    const result = parseInput('/config set key value');
    expect(result.type).toBe('slash-command');
    expect(result.parsed).toBe('config');
    expect(result.args).toEqual(['set', 'key', 'value']);
  });

  it('should parse NL input', () => {
    const result = parseInput('list all files in the current directory');
    expect(result.type).toBe('nl');
    expect(result.raw).toBe('list all files in the current directory');
    expect(result.parsed).toBe('list all files in the current directory');
  });

  it('should treat exit as NL input', () => {
    const result = parseInput('exit');
    expect(result.type).toBe('nl');
    expect(result.parsed).toBe('exit');
  });
});

describe('createRepl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create repl with start method', () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    expect(repl).toHaveProperty('start');
    expect(typeof repl.start).toBe('function');
  });

  it('/help should list all slash commands', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const helpCmd = handler.get('help');
    expect(helpCmd).toBeDefined();
    const result = await helpCmd!.handler([], {});
    expect(result).toContain('help');
    expect(result).toContain('modules');
    expect(result).toContain('history');
    expect(result).toContain('config');
    expect(result).toContain('exit');
  });

  it('/modules should list registered AIModules', async () => {
    const mockModuleRegistry = {
      list: vi.fn().mockReturnValue([
        { id: 'mod1', name: 'Module One', version: '1.0', type: 'ai-enhancement' },
      ]),
      size: vi.fn().mockReturnValue(1),
    };
    const deps = createMockDeps({ moduleRegistry: mockModuleRegistry as never });
    const repl = createRepl(deps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const modulesCmd = handler.get('modules');
    expect(modulesCmd).toBeDefined();
    const result = await modulesCmd!.handler([], { moduleRegistry: mockModuleRegistry as never });
    expect(result).toContain('mod1');
    expect(result).toContain('Module One');
  });

  it('/modules should show no modules message when registry is absent', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const modulesCmd = handler.get('modules');
    const result = await modulesCmd!.handler([], {});
    expect(result).toContain('No');
  });

  it('/history should show conversation history', async () => {
    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue({
        sessionId: 'test',
        history: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ],
        projectContext: { cwd: '/test' },
      }),
    };
    const deps = createMockDeps();
    const repl = createRepl(deps, { sessionId: 'test', sessionManager: mockSessionManager as never });
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const historyCmd = handler.get('history');
    const result = await historyCmd!.handler([], { sessionManager: mockSessionManager, sessionId: 'test' });
    expect(result).toContain('hello');
    expect(result).toContain('hi there');
  });

  it('/config should mask API keys', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const configCmd = handler.get('config');
    const result = await configCmd!.handler([], { config: { apiKey: 'sk-secret-12345', model: 'gpt-4' } });
    expect(result).not.toContain('sk-secret-12345');
    expect(result).toContain('***');
    expect(result).toContain('gpt-4');
  });

  it('/exit should return exit signal', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const exitCmd = handler.get('exit');
    const result = await exitCmd!.handler([], {});
    expect(result).toBe('__EXIT__');
  });

  it('should process NL input through nlProcessor', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const result = await (repl as unknown as { processInput: (input: string) => Promise<unknown> }).processInput('run tests');
    expect(deps.nlProcessor.parse).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('should execute shell command and capture output', async () => {
    const { spawn } = await import('node:child_process');
    const mockSpawn = {
      stdout: { on: vi.fn((event: string, cb: (data: Buffer) => void) => { if (event === 'data') cb(Buffer.from('file1.txt\nfile2.txt')); }) },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => { if (event === 'close') cb(0); }),
    };
    vi.mocked(spawn).mockReturnValue(mockSpawn as never);

    const deps = createMockDeps();
    const repl = createRepl(deps);
    const result = await (repl as unknown as { processInput: (input: string) => Promise<unknown> }).processInput('!ls');
    expect(spawn).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
