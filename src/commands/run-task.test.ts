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
}));

import { runTask } from './run-task.js';

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
