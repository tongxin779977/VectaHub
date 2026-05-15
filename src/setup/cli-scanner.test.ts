import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process.exec before importing the module
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('./first-run-wizard.js', () => ({
  loadConfig: vi.fn(() => ({
    version: 1,
    first_run_completed: true,
    ai_providers: { vectahub_llm: { enabled: true } },
    external_cli: {
      gemini: { enabled: true, has_permission: true },
      claude: { enabled: true, has_permission: true },
      codex: { enabled: true, has_permission: true },
      aider: { enabled: true, has_permission: true },
    },
    priority: ['gemini'],
  })),
  saveConfig: vi.fn(),
}));

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: (_prompt: string, cb: (answer: string) => void) => cb('Y'),
    close: vi.fn(),
  })),
}));

import { exec } from 'child_process';
import {
  scanSingleTool,
  scanCLITools,
  updateCLIToolConfig,
  getAvailableExternalCLI,
  type CLIToolStatus,
} from './cli-scanner.js';
import { loadConfig, saveConfig } from './first-run-wizard.js';
import * as agentAdapter from '../commands/agent-cli-adapter.js';

describe('cli-scanner', () => {
  const mockExec = vi.mocked(exec);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scanSingleTool', () => {
    it('should return null for a tool not in AI_CLI_TOOLS', async () => {
      const result = await scanSingleTool('nonexistent');
      expect(result).toBeNull();
    });

    it('should return CLIToolStatus for a known tool (installed)', async () => {
      mockExec.mockImplementation((cmd: string, cb: any) => {
        if (cmd === 'which gemini') {
          cb(null, { stdout: '/usr/local/bin/gemini\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'gemini --version') {
          cb(null, { stdout: '1.0.0\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'gemini --help') {
          cb(null, { stdout: 'Usage: gemini\n', stderr: '' });
          return {} as any;
        }
        cb(new Error(`unexpected command: ${cmd}`), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await scanSingleTool('gemini');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('gemini');
      expect(result!.installed).toBe(true);
      expect(result!.version).toBe('1.0.0');
      expect(result!.invocable).toBe(true);
      expect(result!.ready).toBe(true);
    });

    it('should return CLIToolStatus for a known tool (not installed)', async () => {
      mockExec.mockImplementation((_cmd: string, cb: any) => {
        cb(new Error('not found'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await scanSingleTool('claude');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('claude');
      expect(result!.installed).toBe(false);
      expect(result!.hasPermission).toBe(false);
      expect(result!.invocable).toBe(false);
      expect(result!.ready).toBe(false);
    });

    it('should catch errors gracefully and return a failed status', async () => {
      // checkTool normally catches exec errors, but if something else throws
      // unexpectedly, scanSingleTool should still return a safe fallback
      mockExec.mockImplementation(() => {
        throw new Error('unexpected crash');
      });

      const result = await scanSingleTool('codex');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('codex');
      expect(result!.installed).toBe(false);
      expect(result!.hasPermission).toBe(false);
      expect(result!.invocable).toBe(false);
      expect(result!.ready).toBe(false);
    });

    it('should return CLIToolStatus for each known tool name', async () => {
      mockExec.mockImplementation((cmd: string, cb: any) => {
        if (cmd.startsWith('which ')) {
          const tool = cmd.replace('which ', '');
          cb(null, { stdout: `/usr/local/bin/${tool}\n`, stderr: '' });
          return {} as any;
        }
        if (cmd.endsWith(' --version')) {
          cb(null, { stdout: '2.0.0\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'gemini --help' || cmd === 'aider --help' || cmd === 'codex exec --help' || cmd === 'claude code --help') {
          cb(null, { stdout: 'help\n', stderr: '' });
          return {} as any;
        }
        cb(new Error(`unexpected command: ${cmd}`), { stdout: '', stderr: '' });
        return {} as any;
      });

      for (const name of ['gemini', 'claude', 'codex', 'aider']) {
        const result = await scanSingleTool(name);
        expect(result).not.toBeNull();
        expect(result!.name).toBe(name);
        expect(result!.installed).toBe(true);
        expect(result!.invocable).toBe(true);
        expect(result!.ready).toBe(true);
      }
    });

    it('should keep installed/version but mark invocable false when codex exec entry fails', async () => {
      mockExec.mockImplementation((cmd: string, cb: any) => {
        if (cmd === 'which codex') {
          cb(null, { stdout: '/usr/local/bin/codex\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex --version') {
          cb(null, { stdout: '0.99.0\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex exec --help') {
          cb(new Error('entry failed'), { stdout: '', stderr: 'entry failed' });
          return {} as any;
        }
        cb(new Error(`unexpected command: ${cmd}`), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await scanSingleTool('codex');
      expect(result).not.toBeNull();
      expect(result!.installed).toBe(true);
      expect(result!.version).toBe('0.99.0');
      expect(result!.invocable).toBe(false);
      expect(result!.ready).toBe(false);
    });

    it('should set ready false when readyArgs check fails after invocable passes', async () => {
      const descriptorSpy = vi.spyOn(agentAdapter, 'getAgentDescriptorById');
      descriptorSpy.mockImplementation((agentId: string) => {
        if (agentId === 'codex') {
          return {
            id: 'codex',
            displayName: 'OpenAI Codex CLI',
            entryCommand: 'codex',
            subcommand: 'exec',
            promptTransport: 'positional',
            workingDirectoryArg: '--cd',
            workingDirectoryArgAliases: ['-C', '--cd'],
            nonInteractiveFlags: [],
            approvalPolicySupport: 'unknown',
            structuredOutputSupport: false,
            preflightSpec: {
              versionArgs: ['--version'],
              invocableArgs: ['exec', '--help'],
              readyArgs: ['exec', '--full-auto', '--help'],
            },
            dryRunRenderMode: 'argv',
          } as any;
        }
        return null;
      });

      mockExec.mockImplementation((cmd: string, cb: any) => {
        if (cmd === 'which codex') {
          cb(null, { stdout: '/usr/local/bin/codex\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex --version') {
          cb(null, { stdout: '0.99.0\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex exec --help') {
          cb(null, { stdout: 'help\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex exec --full-auto --help') {
          cb(new Error('not ready'), { stdout: '', stderr: 'not ready' });
          return {} as any;
        }
        cb(new Error(`unexpected command: ${cmd}`), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await scanSingleTool('codex');
      expect(result).not.toBeNull();
      expect(result!.installed).toBe(true);
      expect(result!.invocable).toBe(true);
      expect(result!.ready).toBe(false);
      expect(result!.readyIssue).toBe('真实入口就绪检查失败');
    });

    it('should fail closed when readyArgs are missing', async () => {
      const descriptorSpy = vi.spyOn(agentAdapter, 'getAgentDescriptorById');
      descriptorSpy.mockImplementation((agentId: string) => {
        if (agentId === 'codex') {
          return {
            id: 'codex',
            displayName: 'OpenAI Codex CLI',
            entryCommand: 'codex',
            subcommand: 'exec',
            promptTransport: 'positional',
            workingDirectoryArg: '--cd',
            workingDirectoryArgAliases: ['-C', '--cd'],
            nonInteractiveFlags: [],
            approvalPolicySupport: 'unknown',
            structuredOutputSupport: false,
            preflightSpec: {
              versionArgs: ['--version'],
              invocableArgs: ['exec', '--help'],
            },
            dryRunRenderMode: 'argv',
          } as any;
        }
        return null;
      });

      mockExec.mockImplementation((cmd: string, cb: any) => {
        if (cmd === 'which codex') {
          cb(null, { stdout: '/usr/local/bin/codex\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex --version') {
          cb(null, { stdout: '0.99.0\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'codex exec --help') {
          cb(null, { stdout: 'help\n', stderr: '' });
          return {} as any;
        }
        cb(new Error(`unexpected command: ${cmd}`), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await scanSingleTool('codex');
      expect(result).not.toBeNull();
      expect(result!.installed).toBe(true);
      expect(result!.invocable).toBe(true);
      expect(result!.ready).toBe(false);
      expect(result!.readyIssue).toBe('缺少就绪探测规则');
    });
  });

  describe('scanCLITools (fault-tolerant)', () => {
    it('should continue scanning when one tool fails', async () => {
      mockExec.mockImplementation((cmd: string, cb: any) => {
        if (cmd.includes('claude')) {
          throw new Error('catastrophic failure');
        }

        if (cmd.startsWith('which ')) {
          cb(null, { stdout: `/usr/local/bin/${cmd.replace('which ', '')}\n`, stderr: '' });
          return {} as any;
        }

        if (cmd.endsWith(' --version')) {
          cb(null, { stdout: '3.0.0\n', stderr: '' });
          return {} as any;
        }
        if (cmd === 'gemini --help' || cmd === 'codex exec --help' || cmd === 'aider --help') {
          cb(null, { stdout: 'help\n', stderr: '' });
          return {} as any;
        }
        cb(new Error(`unexpected command: ${cmd}`), { stdout: '', stderr: '' });
        return {} as any;
      });

      const results = await scanCLITools();
      // Should have results for all 4 tools
      expect(results.length).toBe(4);
      // gemini should be installed
      const gemini = results.find(r => r.name === 'gemini');
      expect(gemini?.installed).toBe(true);
      // claude should be a failed status (fault-tolerant)
      const claude = results.find(r => r.name === 'claude');
      expect(claude?.installed).toBe(false);
      // Other tools should still be scanned
      const codex = results.find(r => r.name === 'codex');
      expect(codex?.installed).toBe(true);
      const aider = results.find(r => r.name === 'aider');
      expect(aider?.installed).toBe(true);
    });

    it('should return results for all tools even if some are not installed', async () => {
      mockExec.mockImplementation((_cmd: string, cb: any) => {
        cb(new Error('command not found'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const results = await scanCLITools();
      expect(results.length).toBe(4);
      for (const r of results) {
        expect(r.installed).toBe(false);
      }
    });
  });

  describe('existing exports', () => {
    it('should export updateCLIToolConfig as a function', () => {
      expect(typeof updateCLIToolConfig).toBe('function');
    });

    it('should export getAvailableExternalCLI as a function', () => {
      expect(typeof getAvailableExternalCLI).toBe('function');
    });

    it('should export CLIToolStatus as a type', () => {
      const status: CLIToolStatus = {
        name: 'test',
        installed: true,
        hasPermission: true,
        invocable: true,
        ready: true,
      };
      expect(status.name).toBe('test');
    });
  });

  describe('config state vs runtime state', () => {
    it('should keep config enabled when tool is installed but currently non-invocable', () => {
      const loadConfigMock = vi.mocked(loadConfig);
      const saveConfigMock = vi.mocked(saveConfig);
      loadConfigMock.mockReturnValue({
        version: 1,
        first_run_completed: true,
        ai_providers: { vectahub_llm: { enabled: true } },
        external_cli: {
          codex: { enabled: true, has_permission: true },
        },
        priority: ['codex'],
      } as any);

      updateCLIToolConfig([{
        name: 'codex',
        installed: true,
        hasPermission: false,
        invocable: false,
        permissionIssue: '无法执行命令',
        ready: false,
      }]);

      expect(saveConfigMock).toHaveBeenCalledTimes(1);
      const saved = saveConfigMock.mock.calls[0][0];
      expect(saved.external_cli.codex.enabled).toBe(true);
      expect(saved.external_cli.codex.has_permission).toBe(false);
    });

    it('should keep config disabled even when runtime probe is invocable', () => {
      const loadConfigMock = vi.mocked(loadConfig);
      const saveConfigMock = vi.mocked(saveConfig);
      loadConfigMock.mockReturnValue({
        version: 1,
        first_run_completed: true,
        ai_providers: { vectahub_llm: { enabled: true } },
        external_cli: {
          gemini: { enabled: false, has_permission: false },
        },
        priority: ['gemini'],
      } as any);

      updateCLIToolConfig([{
        name: 'gemini',
        installed: true,
        hasPermission: true,
        invocable: true,
        version: '1.2.3',
        ready: true,
      }]);

      expect(saveConfigMock).toHaveBeenCalledTimes(1);
      const saved = saveConfigMock.mock.calls[0][0];
      expect(saved.external_cli.gemini.enabled).toBe(false);
      expect(saved.external_cli.gemini.has_permission).toBe(true);
    });
  });
});
