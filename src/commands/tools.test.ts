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
  scanSingleTool: vi.fn(async () => ({
    name: 'codex',
    installed: true,
    version: '1.2.3',
    hasPermission: true,
    invocable: true,
    ready: false,
  })),
}));

const { toolsCmd } = await import('./tools.js');

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
    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0]).toMatchObject({
      name: 'codex',
      installed: true,
      invocable: true,
      ready: false,
    });
  });

  afterAll(() => {
    mockLog.mockRestore();
  });
});
