import { describe, it, expect, beforeEach } from 'vitest';
import { createKnowledgeBase } from './knowledge-base.js';
import type { ToolInfo, CommandInfo } from '../types/command.js';
import type { IEnvironmentService } from '../../infrastructure/interfaces/index.js';

function createMockLogger() {
  return {
    warn: () => {},
    error: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
    level: 'info',
  } as any;
}

const mockEnvironment: IEnvironmentService = {
  getHomePath(): string { return '/tmp/test-vectahub-home'; },
  getPath(..._segments: string[]): string { return '/tmp/test-vectahub-home/commands.json'; },
  resolvePath(..._segments: string[]): string { return '/tmp/test-vectahub-home'; },
  joinPath(..._segments: string[]): string { return '/tmp/test-vectahub-home'; },
  getDirname(_path: string): string { return '/tmp/test-vectahub-home'; },
  readFile(_path: string): string { return ''; },
  readFileAsync(_path: string): Promise<string> { return Promise.resolve(''); },
  readLines(_path: string): AsyncIterable<string> { return (async function* () {})(); },
  writeFile(_path: string, _content: string): void { /* noop */ },
  exists(_path: string): boolean { return false; },
  ensureDir(_path: string): void { /* noop */ },
  mkdirAsync(_path: string, _options?: { recursive?: boolean }): Promise<void> { return Promise.resolve(); },
  readDir(_path: string): string[] { return []; },
  readDirObjects(_path: string): { name: string; isDirectory(): boolean }[] { return []; },
  rm(_path: string, _options?: { recursive?: boolean; force?: boolean }): void { /* noop */ },
  copyFile(_src: string, _dest: string): void { /* noop */ },
  createWriteStream(_path: string, _options?: { encoding?: BufferEncoding; flags?: string }) {
    return { write() { return true; }, end() { /* noop */ } } as any;
  },
  stat(_path: string) { return { size: 0, isDirectory() { return false; } }; },
  getTmpDir(): string { return '/tmp'; },
  getEnv(_name: string, _defaultValue?: string): string | undefined { return undefined; },
  setEnv(_name: string, _value: string): void { /* noop */ },
  deleteEnv(_name: string): void { /* noop */ },
  getEnvBoolean(_name: string, _defaultValue?: boolean): boolean { return false; },
  getEnvNumber(_name: string, _defaultValue?: number): number | undefined { return undefined; },
  getAllEnv(): Record<string, string | undefined> { return {}; },
  exec(_command: string, _options?: { cwd?: string; env?: Record<string, string | undefined>; timeout?: number }): Promise<{ stdout: string; stderr: string }> {
    return Promise.resolve({ stdout: '', stderr: '' });
  },
  spawn(_command: string, _args: string[], _options?: { cwd?: string; env?: Record<string, string | undefined>; stdio?: any }) {
    return { pid: 0, kill() { /* noop */ } } as any;
  },
  exit(_code?: number): never { throw new Error('exit'); },
  getArgv(): string[] { return []; },
  getCwd(): string { return '/tmp'; },
  getPlatform(): string { return 'darwin'; },
  onSignal(_signal: any, _listener: () => void | Promise<void>): void { /* noop */ },
  onUncaughtException(_listener: (error: Error) => void | Promise<void>): void { /* noop */ },
  onUnhandledRejection(_listener: (reason: unknown) => void | Promise<void>): void { /* noop */ },
  onWarning(_listener: (warning: Error) => void): void { /* noop */ },
};

describe('KnowledgeBase', () => {
  let kb: ReturnType<typeof createKnowledgeBase>;

  beforeEach(async () => {
    kb = createKnowledgeBase(mockEnvironment, createMockLogger());
  });

  it('should add and retrieve tool', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      version: '1.0.0',
      commands: [{ name: 'test-cmd', description: 'Test command', usage: 'test-tool test-cmd', category: 'test-tool' }],
      lastScanned: new Date().toISOString(),
    };
    kb.addTool(tool);
    const cmd = kb.getCommand('test-cmd');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('test-cmd');
  });

  it('should search commands by keyword', () => {
    const tool: ToolInfo = {
      name: 'git',
      version: '2.39.0',
      commands: [
        { name: 'clone', description: 'Clone repository', usage: 'git clone', category: 'git' },
        { name: 'commit', description: 'Commit changes', usage: 'git commit', category: 'git' },
      ],
      lastScanned: new Date().toISOString(),
    };
    kb.addTool(tool);
    
    const results = kb.searchCommands('commit');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('commit');
  });

  it('should return undefined for non-existent command', () => {
    const cmd = kb.getCommand('non-existent-cmd');
    expect(cmd).toBeUndefined();
  });

  it('should return empty array when no tools added', () => {
    const results = kb.searchCommands('any');
    expect(results).toEqual([]);
  });

  it('should return all tools', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      version: '1.0.0',
      commands: [],
      lastScanned: new Date().toISOString(),
    };
    kb.addTool(tool);
    const tools = kb.getAllTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('test-tool');
  });
});