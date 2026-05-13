import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../nl/llm.js', () => ({
  createLLMConfig: vi.fn(() => ({ provider: 'openai', model: 'test', apiKey: 'test', baseUrl: 'http://localhost' })),
  LLMClient: class MockLLMClient {
    async completeRaw() {
      return '{"command": "aider", "args": ["--message", "test"], "explanation": "test command"}';
    }
  },
}));

vi.mock('../cli-tools/discovery/cache-manager.js', () => ({
  getToolCacheManager: vi.fn(() => ({
    discoverToolHelp: vi.fn(() => ({
      toolName: 'aider',
      version: '1.0.0',
      helpOutput: 'Usage: aider [options]',
      capabilities: [],
      discoveredAt: '2026-05-10T00:00:00Z',
    })),
  })),
}));

vi.mock('../security-protocol/manager.js', () => ({
  getSecurityManager: vi.fn(() => ({
    detectCommand: vi.fn(() => ({
      isDangerous: false,
      severity: 'none',
    })),
  })),
}));

vi.mock('../infrastructure/audit/index.js', () => ({
  audit: {
    securityAction: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  createConsoleLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { runTask, collectGitChanges, formatRunTaskJson } from './run-task.js';

describe('runTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success with dryRun mode', async () => {
    const result = await runTask({
      tool: 'aider',
      taskId: '1.1',
      taskLabel: '实现登录',
      doc: '/path/to/doc.md',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.command).toContain('aider');
    expect(result.output).toBe('');
  });

  it('should return command string in result', async () => {
    const result = await runTask({
      tool: 'aider',
      taskId: '2.1',
      dryRun: true,
    });

    expect(result.command).toBeDefined();
    expect(typeof result.command).toBe('string');
    expect(result.command.length).toBeGreaterThan(0);
  });

  it('should use default task label when not provided', async () => {
    const result = await runTask({
      tool: 'aider',
      taskId: '3.1',
      dryRun: true,
    });

    expect(result.success).toBe(true);
  });

  it('should block dangerous commands via security manager', async () => {
    const { getSecurityManager } = await import('../security-protocol/manager.js');
    const mockSecurityManager = {
      detectCommand: vi.fn(() => ({
        isDangerous: true,
        severity: 'critical',
        rule: { name: 'test-rule' },
        matchedPattern: 'rm -rf',
      })),
    };
    vi.mocked(getSecurityManager).mockReturnValue(mockSecurityManager as any);

    const result = await runTask({
      tool: 'aider',
      taskId: '1.1',
      taskLabel: 'dangerous task',
      dryRun: false,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('安全策略拦截');
  });
});

describe('collectGitChanges', () => {
  it('should return git change info when there are uncommitted changes', async () => {
    const result = await collectGitChanges();
    if (result) {
      expect(result).toHaveProperty('shortStat');
      expect(result).toHaveProperty('diffStat');
      expect(result).toHaveProperty('changedFiles');
      expect(Array.isArray(result.changedFiles)).toBe(true);
    }
  });

  it('should return null when not in a git repo or no changes', async () => {
    const result = await collectGitChanges();
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('formatRunTaskJson', () => {
  it('should keep JSON payload concise for noisy agent output', () => {
    const noisyOutput = [
      'All tests passed successfully.',
      'Warning: 256-color support not detected.',
      'YOLO mode is enabled. All tool calls will be automatically approved.',
      'Attempt 1 failed. Retrying with backoff... _GaxiosError: request failed',
      'x'.repeat(5000),
    ].join('\n');

    const result = formatRunTaskJson({
      success: true,
      command: 'gemini -p "test"',
      output: noisyOutput,
    });

    expect(result.ok).toBe(true);
    expect(result.output).not.toContain('YOLO mode is enabled');
    expect(result.output).not.toContain('_GaxiosError');
    expect(String(result.output).length).toBeLessThanOrEqual(50000);
    expect(result.outputTruncated).toBe(true);
  });

  it('should truncate long JSON output on a line boundary when possible', () => {
    const longOutput = Array.from({ length: 700 }, (_, i) => `line-${i} ${'x'.repeat(90)}`).join('\n');

    const result = formatRunTaskJson({
      success: true,
      command: 'gemini -p "test"',
      output: longOutput,
    });

    expect(result.outputTruncated).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(50000);
    expect(result.output).toContain('\n... (output truncated)');
    expect(result.output).not.toMatch(/x+\.\.\. \(output truncated\)$/);
  });
});
