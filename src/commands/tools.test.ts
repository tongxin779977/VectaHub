import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('../cli-tools/index.js', () => ({
  getCliToolRegistry: vi.fn(() => ({
    getAllTools: vi.fn(() => []),
    getTool: vi.fn(() => null),
    getCommandInfo: vi.fn(() => null),
    isCommandDangerous: vi.fn(() => false),
    searchTools: vi.fn(() => []),
    searchCommands: vi.fn(() => []),
    register: vi.fn(),
  })),
  getAllKnownTools: vi.fn(() => []),
  getKnownTool: vi.fn(() => null),
  CommandRuleEngine: class {
    evaluate() {
      return { decision: 'allow' };
    }
  },
  getSecurityTemplate: vi.fn(() => []),
  loadConfig: vi.fn(async () => ({ registeredTools: [] })),
  saveConfig: vi.fn(async () => undefined),
}));

vi.mock('../cli-tools/tools/npm.js', () => ({
  npmTool: { name: 'npm', commands: {}, description: 'npm' },
}));

vi.mock('../setup/first-run-wizard.js', () => ({
  loadConfig: vi.fn(() => ({
    external_cli: {
      codex: { enabled: true, has_permission: true },
    },
  })),
}));

vi.mock('../setup/cli-scanner.js', () => ({
  scanSingleTool: vi.fn(async (name: string) => {
    if (name === 'codex') {
      return {
        name: 'codex',
        installed: true,
        version: '1.2.3',
        hasPermission: true,
        invocable: true,
        ready: false,
      };
    }
    return {
      name,
      installed: false,
      version: undefined,
      hasPermission: true,
      invocable: false,
      ready: false,
    };
  }),
  syncCLIToolPermissionState: vi.fn(),
}));

const { toolsCmd } = await import('./tools.js');
const cliScannerModule = await import('../setup/cli-scanner.js');
const setupModule = await import('../setup/first-run-wizard.js');

describe('tools agents --json', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  beforeEach(() => {
    mockLog.mockClear();
  });

  it('should output installed, invocable and ready in json', async () => {
    await toolsCmd.parseAsync(['node', 'test', 'agents', '--json']);
    const output = mockLog.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.agents).toHaveLength(4);
    expect(parsed.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'codex',
        installed: true,
        invocable: true,
        ready: false,
      }),
    ]));
    expect(parsed.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'gemini',
        installed: false,
      }),
      expect.objectContaining({
        name: 'claude',
        installed: false,
      }),
      expect.objectContaining({
        name: 'aider',
        installed: false,
      }),
    ]));
    expect(parsed.agents.find((agent: any) => agent.name === 'codex')).toMatchObject({
      name: 'codex',
      installed: true,
      invocable: true,
      ready: false,
    });
  });

  it('should sync permission state when --sync-config is provided', async () => {
    const syncSpy = vi.mocked(cliScannerModule.syncCLIToolPermissionState);

    await toolsCmd.parseAsync(['node', 'test', 'agents', '--json', '--sync-config']);

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'codex',
        installed: true,
        hasPermission: true,
        invocable: true,
        ready: false,
      }),
    ]));
  });

  it('should still list known agents when external_cli config is empty', async () => {
    vi.mocked(setupModule.loadConfig).mockReturnValueOnce({
      external_cli: {},
    } as any);

    await toolsCmd.parseAsync(['node', 'test', 'agents', '--json']);

    const output = mockLog.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'codex',
        installed: true,
        invocable: true,
        ready: false,
        configured_enabled: true,
        has_permission: true,
      }),
    ]));
  });

  afterAll(() => {
    mockLog.mockRestore();
  });
});
