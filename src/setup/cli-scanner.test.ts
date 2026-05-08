import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('cli-scanner', () => {
  const mockExec = vi.mocked(exec);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scanSingleTool', () => {
    it('should return null for a tool not in AI_CLI_TOOLS', async () => {
      const result = await scanSingleTool('nonexistent');
      expect(result).toBeNull();
    });

    it('should return CLIToolStatus for a known tool (installed)', async () => {
      mockExec.mockImplementation((_cmd: string, cb: any) => {
        cb(null, { stdout: '1.0.0\n', stderr: '' });
        return {} as any;
      });

      const result = await scanSingleTool('gemini');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('gemini');
      expect(result!.installed).toBe(true);
      expect(result!.version).toBe('1.0.0');
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
      expect(result!.enabled).toBe(false);
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
      expect(result!.enabled).toBe(false);
    });

    it('should return CLIToolStatus for each known tool name', async () => {
      mockExec.mockImplementation((_cmd: string, cb: any) => {
        cb(null, { stdout: '2.0.0\n', stderr: '' });
        return {} as any;
      });

      for (const name of ['gemini', 'claude', 'codex', 'aider']) {
        const result = await scanSingleTool(name);
        expect(result).not.toBeNull();
        expect(result!.name).toBe(name);
        expect(result!.installed).toBe(true);
      }
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

        cb(null, { stdout: '3.0.0\n', stderr: '' });
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
        enabled: true,
      };
      expect(status.name).toBe('test');
    });
  });
});
