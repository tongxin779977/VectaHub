import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeishuCliPlugin } from './feishu-plugin.js';
import { createOpenCliPlugin } from './opencli-plugin.js';
import { createGeminiCliPlugin } from './gemini-plugin.js';
import { createAIModuleRegistry } from '../registry.js';
import type { CliPlugin, CliPluginCapabilities } from './types.js';
import type { AIModuleContext } from '../types.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execSync, spawn } from 'child_process';

const mockExecSync = vi.mocked(execSync);
const mockSpawn = vi.mocked(spawn);

function createMockSpawn(stdout: string, stderr: string, exitCode: number) {
  const emitter: any = {
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  };
  mockSpawn.mockReturnValue(emitter);

  emitter.stdout.on.mockImplementation((event: string, cb: (chunk: Buffer) => void) => {
    if (event === 'data') cb(Buffer.from(stdout));
  });
  emitter.stderr.on.mockImplementation((event: string, cb: (chunk: Buffer) => void) => {
    if (event === 'data') cb(Buffer.from(stderr));
  });
  emitter.on.mockImplementation((event: string, cb: (code: number) => void) => {
    if (event === 'close') cb(exitCode);
  });

  return emitter;
}

describe('FeishuCliPlugin', () => {
  let plugin: CliPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createFeishuCliPlugin();
  });

  it('should have correct registration properties', () => {
    expect(plugin.id).toBe('vectahub.cli.feishu');
    expect(plugin.name).toBe('Feishu CLI');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.type).toBe('cli-plugin');
    expect(plugin.cliCommand).toBe('feishu');
    expect(plugin.versionCommand).toBe('feishu --version');
  });

  it('should canHandle when delegateTo is feishu and available', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/feishu'));
    const ctx: AIModuleContext = { delegateTo: 'feishu' };
    expect(await plugin.canHandle(ctx)).toBe(true);
  });

  it('should not canHandle when delegateTo is other', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/feishu'));
    const ctx: AIModuleContext = { delegateTo: 'other' };
    expect(await plugin.canHandle(ctx)).toBe(false);
  });

  it('should not canHandle when delegateTo is undefined', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/feishu'));
    const ctx: AIModuleContext = { userInput: 'test' };
    expect(await plugin.canHandle(ctx)).toBe(false);
  });

  it('should return false from canHandle when not available', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    const ctx: AIModuleContext = { delegateTo: 'feishu' };
    expect(await plugin.canHandle(ctx)).toBe(false);
  });

  it('should return false from isAvailable when command not in PATH', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(await plugin.isAvailable()).toBe(false);
  });

  it('should return true from isAvailable when command in PATH', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/feishu'));
    expect(await plugin.isAvailable()).toBe(true);
  });

  it('should return correct capabilities', () => {
    const caps = plugin.getCapabilities();
    expect(caps.supportedActions).toEqual(['send-message', 'list-channels', 'upload-file']);
    expect(caps.outputFormats).toEqual(['text', 'json']);
    expect(caps.requiresAuth).toBe(true);
  });

  it('should execute and return CliPluginResult', async () => {
    createMockSpawn('ok result', '', 0);
    const ctx: AIModuleContext = { delegateTo: 'feishu' };
    const result = await plugin.execute('send-message --channel #dev', ctx);
    expect(result.success).toBe(true);
    expect(result.data?.exitCode).toBe(0);
    expect(result.data?.stdout).toBe('ok result');
    expect(result.data?.stderr).toBe('');
    expect(result.data?.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('OpenCliPlugin', () => {
  let plugin: CliPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createOpenCliPlugin();
  });

  it('should have correct registration properties', () => {
    expect(plugin.id).toBe('vectahub.cli.opencli');
    expect(plugin.name).toBe('OpenCLI');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.type).toBe('cli-plugin');
    expect(plugin.cliCommand).toBe('opencli');
    expect(plugin.versionCommand).toBe('opencli --version');
  });

  it('should canHandle when delegateTo is opencli and available', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/opencli'));
    const ctx: AIModuleContext = { delegateTo: 'opencli' };
    expect(await plugin.canHandle(ctx)).toBe(true);
  });

  it('should not canHandle when delegateTo is other', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/opencli'));
    const ctx: AIModuleContext = { delegateTo: 'feishu' };
    expect(await plugin.canHandle(ctx)).toBe(false);
  });

  it('should return false from isAvailable when not in PATH', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(await plugin.isAvailable()).toBe(false);
  });

  it('should return correct capabilities', () => {
    const caps = plugin.getCapabilities();
    expect(caps.supportedActions).toEqual(['scrape', 'search', 'summarize']);
    expect(caps.outputFormats).toEqual(['text', 'json']);
    expect(caps.requiresAuth).toBe(false);
  });

  it('should execute and return CliPluginResult', async () => {
    createMockSpawn('scraped data', '', 0);
    const ctx: AIModuleContext = { delegateTo: 'opencli' };
    const result = await plugin.execute('scrape https://example.com', ctx);
    expect(result.success).toBe(true);
    expect(result.data?.exitCode).toBe(0);
    expect(result.data?.stdout).toBe('scraped data');
  });
});

describe('GeminiCliPlugin', () => {
  let plugin: CliPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createGeminiCliPlugin();
  });

  it('should have correct registration properties', () => {
    expect(plugin.id).toBe('vectahub.cli.gemini');
    expect(plugin.name).toBe('Gemini CLI');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.type).toBe('cli-plugin');
    expect(plugin.cliCommand).toBe('gemini');
    expect(plugin.versionCommand).toBe('gemini --version');
  });

  it('should canHandle when delegateTo is gemini and available', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/gemini'));
    const ctx: AIModuleContext = { delegateTo: 'gemini' };
    expect(await plugin.canHandle(ctx)).toBe(true);
  });

  it('should not canHandle when delegateTo is other', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/gemini'));
    const ctx: AIModuleContext = { delegateTo: 'opencli' };
    expect(await plugin.canHandle(ctx)).toBe(false);
  });

  it('should return false from isAvailable when not in PATH', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(await plugin.isAvailable()).toBe(false);
  });

  it('should return correct capabilities', () => {
    const caps = plugin.getCapabilities();
    expect(caps.supportedActions).toEqual(['chat', 'code-review', 'generate']);
    expect(caps.outputFormats).toEqual(['text', 'json']);
    expect(caps.requiresAuth).toBe(false);
  });

  it('should execute and return CliPluginResult', async () => {
    createMockSpawn('gemini response', '', 0);
    const ctx: AIModuleContext = { delegateTo: 'gemini' };
    const result = await plugin.execute('chat "hello"', ctx);
    expect(result.success).toBe(true);
    expect(result.data?.exitCode).toBe(0);
    expect(result.data?.stdout).toBe('gemini response');
  });
});

describe('Custom CliPlugin via factory pattern', () => {
  it('should register a custom CliPlugin', () => {
    const registry = createAIModuleRegistry();
    const customPlugin: CliPlugin = {
      id: 'vectahub.cli.custom',
      name: 'Custom CLI',
      version: '1.0.0',
      type: 'cli-plugin',
      cliCommand: 'custom',
      versionCommand: 'custom --version',
      canHandle: async () => true,
      isAvailable: async () => true,
      getCapabilities: () => ({
        supportedActions: ['do-thing'],
        outputFormats: ['text'],
        requiresAuth: false,
      }),
      execute: async () => ({ success: true, data: { exitCode: 0, stdout: '', stderr: '', duration: 0 } }),
    };
    registry.register(customPlugin);
    expect(registry.get('vectahub.cli.custom')).toBe(customPlugin);
    expect(registry.listByType('cli-plugin')).toHaveLength(1);
  });
});

describe('Plugin unavailable scenario', () => {
  it('should have isAvailable return false and canHandle return false when command not found', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });

    const feishu = createFeishuCliPlugin();
    const opencli = createOpenCliPlugin();
    const gemini = createGeminiCliPlugin();

    expect(await feishu.isAvailable()).toBe(false);
    expect(await opencli.isAvailable()).toBe(false);
    expect(await gemini.isAvailable()).toBe(false);

    expect(await feishu.canHandle({ delegateTo: 'feishu' })).toBe(false);
    expect(await opencli.canHandle({ delegateTo: 'opencli' })).toBe(false);
    expect(await gemini.canHandle({ delegateTo: 'gemini' })).toBe(false);
  });
});

describe('Delegate routing via moduleRegistry', () => {
  it('should find applicable plugin by delegateTo context', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/feishu'));

    const registry = createAIModuleRegistry();
    const feishu = createFeishuCliPlugin();
    registry.register(feishu);

    const applicable = await registry.findApplicable({ delegateTo: 'feishu' });
    expect(applicable).toHaveLength(1);
    expect(applicable[0].id).toBe('vectahub.cli.feishu');
  });

  it('should not find plugin when delegateTo does not match', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/feishu'));

    const registry = createAIModuleRegistry();
    const feishu = createFeishuCliPlugin();
    registry.register(feishu);

    const applicable = await registry.findApplicable({ delegateTo: 'gemini' });
    expect(applicable).toHaveLength(0);
  });

  it('should return multiple applicable plugins for different types', async () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/local/bin/tool'));

    const registry = createAIModuleRegistry();
    registry.register(createFeishuCliPlugin());
    registry.register(createOpenCliPlugin());
    registry.register(createGeminiCliPlugin());

    const feishuResults = await registry.findApplicable({ delegateTo: 'feishu' });
    expect(feishuResults).toHaveLength(1);
    expect(feishuResults[0].id).toBe('vectahub.cli.feishu');

    const opencliResults = await registry.findApplicable({ delegateTo: 'opencli' });
    expect(opencliResults).toHaveLength(1);
    expect(opencliResults[0].id).toBe('vectahub.cli.opencli');

    const geminiResults = await registry.findApplicable({ delegateTo: 'gemini' });
    expect(geminiResults).toHaveLength(1);
    expect(geminiResults[0].id).toBe('vectahub.cli.gemini');
  });
});
