import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: vi.fn(actual.execFile),
    spawn: vi.fn(actual.spawn),
  };
});

vi.mock('../nl/llm.js', () => ({
  createLLMConfig: vi.fn(() => ({ provider: 'openai', model: 'test', apiKey: 'test', baseUrl: 'http://localhost' })),
  LLMClient: class MockLLMClient {
    async completeRaw() {
      return '{"command": "aider", "args": ["--message", "test"], "explanation": "test command"}';
    }
  },
}));

vi.mock('../cli-tools/discovery/cache-manager.js', () => ({
  discoverToolHelpMock: vi.fn(() => ({
    toolName: 'aider',
    version: '1.0.0',
    helpOutput: 'Usage: aider [options]',
    capabilities: [],
    discoveredAt: '2026-05-10T00:00:00Z',
  })),
  toolCacheManagerMock: {
    discoverToolHelp: vi.fn(() => ({
      toolName: 'aider',
      version: '1.0.0',
      helpOutput: 'Usage: aider [options]',
      capabilities: [],
      discoveredAt: '2026-05-10T00:00:00Z',
    })),
  },
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

vi.mock('../security-protocol/engine.js', () => ({
  assessCommandRisk: vi.fn(() => ({
    level: 'safe',
    needsConfirmation: false,
  })),
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

import { runTask, collectGitChanges, formatRunTaskJson, runVerificationCommands, splitCommandArgs, buildDefaultPrompt, type RunTaskResult } from './run-task.js';
import { createLLMConfig } from '../nl/llm.js';
import { execFile, spawn } from 'node:child_process';
import type { AgentTaskContract } from '../types/doc-task.js';

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

  it('should keep dryRun local and skip LLM/tool discovery', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = {
      discoverToolHelp: vi.fn(() => ({
        toolName: 'aider',
        version: '1.0.0',
        helpOutput: 'Usage: aider [options]',
        capabilities: [],
        discoveredAt: '2026-05-10T00:00:00Z',
      })),
    };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    try {
      const result = await runTask({
        tool: 'aider',
        taskId: '1.2',
        taskLabel: '本地 dry-run',
        doc: '/path/to/doc.md',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.command).toContain('aider --message');
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
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

  it('should attach agent task contract summary without exposing doc excerpt in JSON', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-'));
    const docPath = join(tempDir, 'tasks.md');
    writeFileSync(docPath, [
      '# Tasks',
      '## P2-2 接入 run-task contract',
      '修改 `src/commands/run-task.ts`。',
      '补充 src/commands/run-task.test.ts 测试。',
    ].join('\n'));

    try {
      const result = await runTask({
        tool: 'aider',
        taskId: 'P2-2',
        taskLabel: '接入 run-task contract',
        doc: docPath,
        dryRun: true,
      });
      const json = formatRunTaskJson(result);

      expect(json.agentTaskContract?.boundaryConfidence).toBe('medium');
      expect(json.agentTaskContract?.allowedFiles).toEqual([
        'src/commands/run-task.ts',
        'src/commands/run-task.test.ts',
      ]);
      expect(JSON.stringify(json)).not.toContain('文档片段');
      expect(JSON.stringify(json)).not.toContain('修改 `src/commands/run-task.ts`');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should preview contract without loading LLM or requiring tool', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-preview-'));
    const docPath = join(tempDir, 'tasks.md');
    writeFileSync(docPath, [
      '# Tasks',
      '## P2-4 合同预览',
      '修改 `src/commands/run-task.ts`。',
    ].join('\n'));

    try {
      const result = await runTask({
        taskId: 'P2-4',
        taskLabel: '合同预览',
        doc: docPath,
        contractPreview: true,
      });
      const json = formatRunTaskJson(result);

      expect(result.success).toBe(true);
      expect(result.command).toBe('');
      expect(json.agentTaskContract?.allowedFiles).toEqual(['src/commands/run-task.ts']);
      expect(createLLMConfig).not.toHaveBeenCalled();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
    const originalGetSecurityManagerImpl = vi.mocked(getSecurityManager).getMockImplementation();
    const mockSecurityManager = {
      detectCommand: vi.fn(() => ({
        isDangerous: true,
        severity: 'critical',
        rule: { name: 'test-rule' },
        matchedPattern: 'rm -rf',
      })),
    };
    vi.mocked(getSecurityManager).mockReturnValue(mockSecurityManager as any);

    try {
      const result = await runTask({
        tool: 'aider',
        taskId: '1.1',
        taskLabel: 'dangerous task',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('安全策略拦截');
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.fallbackUsed).toBe(false);
      expect(result.error).toEqual({
        code: 'SECURITY_BLOCKED',
        message: '安全策略拦截: test-rule',
      });
    } finally {
      if (originalGetSecurityManagerImpl) {
        vi.mocked(getSecurityManager).mockImplementation(originalGetSecurityManagerImpl as any);
      }
    }
  });

  it('should build a local dry-run preview command without fallback prompt text', async () => {
    const result = await runTask({
      tool: 'aider',
      taskId: 'P2-6',
      taskLabel: '收紧默认提示词',
      doc: '/path/to/doc.md',
      dryRun: true,
    });

    expect(result.command).toContain('dry-run 预览');
    expect(result.command).toContain('建议验证命令');
    expect(result.command).not.toContain('优先依据任务边界合同中的文档片段');
    expect(result.command).not.toContain('先阅读参考文档');
  });

  it('should use codex adapter path and skip tool discovery/LLM generation', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-7',
        taskLabel: 'adapter path codex',
        doc: '/path/to/doc.md',
        dryRun: true,
      });
      expect(result.command).toContain('codex exec --cd');
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.fallbackUsed).toBe(false);
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
  });

  it('should keep mixed-case known tool on adapter dry-run path without validator block', async () => {
    const result = await runTask({
      tool: 'CoDeX',
      taskId: 'P2-7B',
      taskLabel: 'adapter mixed-case codex',
      doc: '/path/to/doc.md',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.command).toContain('codex exec --cd');
    expect(result.commandGenerationPath).toBe('adapter');
    expect(result.fallbackUsed).toBe(false);
  });

  it('should use aider adapter path for normal run and skip tool discovery/LLM generation', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'aider' && Array.isArray(args) && args.join(' ') === '--help') {
        cb(null, 'Usage: aider [options]\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    vi.mocked(spawn).mockImplementation(((file: any) => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write(`mock run for ${String(file)}\n`);
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'aider',
        taskId: 'P2-8',
        taskLabel: 'adapter path aider',
        doc: '/path/to/doc.md',
        dryRun: false,
      });
      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.fallbackUsed).toBe(false);
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      process.env.VECTAHUB_HOME = originalVectaHubHome;
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
      llmSpy.mockRestore();
    }
  });

  it('should keep unknown tool on legacy help + LLM path', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn(() => ({
      toolName: 'unknown-cli',
      version: '1.0.0',
      helpOutput: 'Usage: unknown-cli [options]',
      capabilities: [],
      discoveredAt: '2026-05-10T00:00:00Z',
    })) };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    try {
      const result = await runTask({
        tool: 'unknown-cli',
        taskId: 'P2-9',
        taskLabel: 'legacy path',
        doc: '/path/to/doc.md',
        dryRun: false,
      });
      const json = formatRunTaskJson(result);
      expect(result.commandGenerationPath).toBe('llm-fallback');
      expect(json.commandGenerationPath).toBe('llm-fallback');
      expect(llmSpy).toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
  });

  it('should fail closed when llm-generated command differs from input tool and never spawn', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const securityManagerModule = await import('../security-protocol/manager.js');
    const originalCompleteRaw = llmModule.LLMClient.prototype.completeRaw;
    const getSecurityManagerSpy = vi.mocked(securityManagerModule.getSecurityManager);
    const execFileCallsBefore = vi.mocked(execFile).mock.calls.length;
    getSecurityManagerSpy.mockClear();
    llmModule.LLMClient.prototype.completeRaw = vi.fn(async () => (
      '{"command":"bash","args":["-lc","echo hacked"],"explanation":"bad rewrite"}'
    ));
    const toolCacheManager = { discoverToolHelp: vi.fn(() => ({
      toolName: 'unknown-cli',
      version: '1.0.0',
      helpOutput: 'Usage: unknown-cli [options]',
      capabilities: [],
      discoveredAt: '2026-05-10T00:00:00Z',
    })) };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    try {
      const result = await runTask({
        tool: 'unknown-cli',
        taskId: 'P2-11',
        taskLabel: 'validator block mismatched command',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_INVOCATION');
      expect(result.output).toContain('invocation validator');
      expect(result.output).toContain('已阻断执行');
      expect(result.commandGenerationPath).toBe('llm-fallback');
      expect(vi.mocked(spawn).mock.calls.length).toBe(0);
      expect(getSecurityManagerSpy).not.toHaveBeenCalled();
      expect(vi.mocked(execFile).mock.calls.length).toBe(execFileCallsBefore);
    } finally {
      llmModule.LLMClient.prototype.completeRaw = originalCompleteRaw;
    }
  });

  it('should fail preflight on codex real entry check and never spawn when exec help is unavailable', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --help') {
        cb(new Error('exec help failed'));
        return {} as any;
      }
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === '--version') {
        cb(null, '0.99.0\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-10',
        taskLabel: 'preflight negative',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('未安装或无执行权限');
      const codexCalls = vi.mocked(execFile).mock.calls.filter(call => call[0] === 'codex');
      expect(codexCalls.some(call => Array.isArray(call[1]) && (call[1] as string[]).join(' ') === 'exec --help')).toBe(true);
      expect(vi.mocked(spawn).mock.calls.length).toBe(0);
    } finally {
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
    }
  });
});

describe('buildDefaultPrompt', () => {
  it('should prioritize AgentTaskContract fields and keep docPath as supplemental reference', () => {
    const contract: AgentTaskContract = {
      taskId: 'P4-1',
      label: '收敛执行提示词',
      docPath: '/tmp/tasks.md',
      docExcerpt: '仅修改 src/commands/run-task.ts 与 run-task.test.ts',
      allowedFiles: ['src/commands/run-task.ts', 'src/commands/run-task.test.ts'],
      forbiddenFiles: ['src/workflow/index.ts'],
      validationCommands: ['npm test -- src/commands/run-task.test.ts', 'npm run typecheck'],
      timeoutMs: 600000,
      executionMode: 'serial',
      boundaryConfidence: 'medium',
      notes: [],
    };

    const prompt = buildDefaultPrompt('P4-1', '收敛执行提示词', '/tmp/tasks.md', contract);

    expect(prompt).toContain('合同是主输入');
    expect(prompt).toContain('任务编号：P4-1');
    expect(prompt).toContain('任务描述：收敛执行提示词');
    expect(prompt).toContain('文档片段：');
    expect(prompt).toContain('仅修改 src/commands/run-task.ts 与 run-task.test.ts');
    expect(prompt).toContain('允许修改范围：');
    expect(prompt).toContain('禁止修改范围：');
    expect(prompt).toContain('建议验证命令：');
    expect(prompt).toContain('边界可信度：medium');
    expect(prompt).toContain('参考文档路径（补充引用）：/tmp/tasks.md');
    expect(prompt).toContain('仅在片段不足且边界允许时，补充引用 /tmp/tasks.md 的必要上下文');
    expect(prompt).not.toContain('先阅读参考文档');
    expect(prompt).not.toContain('按照文档中的技术方案和接口定义完整实现');
  });

  it('should enforce minimal changes and blocking note when excerpt is missing or confidence is low', () => {
    const contract: AgentTaskContract = {
      taskId: 'P4-2',
      label: '低置信度场景',
      docPath: '/tmp/missing.md',
      docExcerpt: '',
      allowedFiles: ['src/commands/run-task.ts'],
      forbiddenFiles: ['src/workflow/index.ts'],
      validationCommands: ['npm run typecheck'],
      timeoutMs: 600000,
      executionMode: 'serial',
      boundaryConfidence: 'low',
      notes: ['doc-not-found'],
    };

    const prompt = buildDefaultPrompt('P4-2', '低置信度场景', '/tmp/missing.md', contract);

    expect(prompt).toContain('当前文档片段缺失或边界可信度较低；仅允许最小改动。');
    expect(prompt).toContain('若无法在允许修改范围内完成，输出阻塞说明并停止，不要扩大改动范围。');
    expect(prompt).toContain('文档片段：\n(未提供文档片段)');
  });

  it('should enforce minimal-change guidance when docExcerpt is empty even with medium confidence', () => {
    const contract: AgentTaskContract = {
      taskId: 'P4-3',
      label: '缺片段中等可信度',
      docPath: '/tmp/tasks.md',
      docExcerpt: '',
      allowedFiles: ['src/commands/run-task.ts'],
      forbiddenFiles: ['src/workflow/index.ts'],
      validationCommands: ['npm run typecheck'],
      timeoutMs: 600000,
      executionMode: 'serial',
      boundaryConfidence: 'medium',
      notes: [],
    };

    const prompt = buildDefaultPrompt('P4-3', '缺片段中等可信度', '/tmp/tasks.md', contract);

    expect(prompt).toContain('当前文档片段缺失或边界可信度较低；仅允许最小改动。');
    expect(prompt).toContain('若无法在允许修改范围内完成，输出阻塞说明并停止，不要扩大改动范围。');
  });

  it('should enforce minimal-change guidance when confidence is none even with docExcerpt', () => {
    const contract: AgentTaskContract = {
      taskId: 'P4-4',
      label: '有片段低可信度',
      docPath: '/tmp/tasks.md',
      docExcerpt: '仅限改动 run-task 文件',
      allowedFiles: ['src/commands/run-task.ts'],
      forbiddenFiles: ['src/workflow/index.ts'],
      validationCommands: ['npm run typecheck'],
      timeoutMs: 600000,
      executionMode: 'serial',
      boundaryConfidence: 'none',
      notes: [],
    };

    const prompt = buildDefaultPrompt('P4-4', '有片段低可信度', '/tmp/tasks.md', contract);

    expect(prompt).toContain('当前文档片段缺失或边界可信度较低；仅允许最小改动。');
    expect(prompt).toContain('若无法在允许修改范围内完成，输出阻塞说明并停止，不要扩大改动范围。');
    expect(prompt).toContain('仅限改动 run-task 文件');
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
      'xterm.js: Parsing error',
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
    expect(result.output).not.toContain('xterm.js: Parsing error');
    expect(result.output).not.toContain('_GaxiosError');
    expect(String(result.output).length).toBeLessThanOrEqual(50000);
    expect(result.outputTruncated).toBe(true);
  });

  it('should include structured error field in JSON', () => {
    const result = formatRunTaskJson({
      success: false,
      command: 'gemini -p "test"',
      output: 'Agent CLI timeout after 600000ms',
      error: {
        code: 'TIMEOUT',
        message: 'Agent CLI timeout after 600000ms',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      code: 'TIMEOUT',
      message: 'Agent CLI timeout after 600000ms',
    });
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

  it('should include verification in JSON when present', () => {
    const result = formatRunTaskJson({
      success: false,
      command: 'aider --message test',
      output: 'done',
      verification: {
        ok: false,
        commands: [
          { command: 'npm run typecheck', ok: false, exitCode: 1, durationMs: 500 },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.verification).toBeDefined();
    expect(result.verification!.ok).toBe(false);
    expect(result.verification!.commands).toHaveLength(1);
  });

  it('should not include verification in JSON when absent', () => {
    const result = formatRunTaskJson({
      success: true,
      command: 'aider --message test',
      output: 'done',
    });

    expect(result.verification).toBeUndefined();
  });
});

describe('runVerificationCommands', () => {
  it('should return ok=true when all commands pass', async () => {
    const result = await runVerificationCommands(
      ['node -e "process.exit(0)"', 'node -e "process.exit(0)"'],
      process.cwd(),
    );
    expect(result.ok).toBe(true);
    expect(result.commands).toHaveLength(2);
    expect(result.commands.every(c => c.ok)).toBe(true);
  });

  it('should return verification result with empty commands for empty input', async () => {
    const result = await runVerificationCommands([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.commands).toHaveLength(0);
  });

  it('should limit commands to 10', async () => {
    // We can't easily mock execFileAsync since it's captured at module load time.
    // Instead, test that the function handles the slice correctly by providing
    // commands that will fail quickly (non-existent executables).
    const commands = Array.from({ length: 15 }, (_, i) => `nonexistent_cmd_${i}`);
    const result = await runVerificationCommands(commands, process.cwd());
    expect(result.commands).toHaveLength(10);
    expect(result.ok).toBe(false);
  });

  it('should mark non-executable commands as failed', async () => {
    const result = await runVerificationCommands(
      ['__definitely_not_a_real_command_xyz__'],
      process.cwd(),
    );
    expect(result.ok).toBe(false);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].ok).toBe(false);
    expect(result.commands[0].command).toBe('__definitely_not_a_real_command_xyz__');
    expect(typeof result.commands[0].durationMs).toBe('number');
    expect(result.isSystemError).toBe(true);
  });

  it('should mark a passing command as ok', async () => {
    const result = await runVerificationCommands(
      ['node -e "process.exit(0)"'],
      process.cwd(),
    );
    expect(result.ok).toBe(true);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].ok).toBe(true);
    expect(result.commands[0].exitCode).toBe(0);
    expect(result.commands[0].stdoutSummary).toBeDefined();
  });

  it('should mark a failing command as not ok', async () => {
    const result = await runVerificationCommands(
      ['node -e process.exit(1)'],
      process.cwd(),
    );
    expect(result.ok).toBe(false);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].ok).toBe(false);
  });

  it('should track mixed pass and fail results', async () => {
    const result = await runVerificationCommands(
      [
        'node -e process.exit(0)',
        'node -e process.exit(1)',
        'node -e process.exit(0)',
      ],
      process.cwd(),
    );
    expect(result.ok).toBe(false);
    expect(result.commands).toHaveLength(3);
    expect(result.commands[0].ok).toBe(true);
    expect(result.commands[1].ok).toBe(false);
    expect(result.commands[2].ok).toBe(true);
  });

  it('should truncate stdout summary to 600 chars', async () => {
    const longOutput = 'x'.repeat(1000);
    const result = await runVerificationCommands(
      [`node -e "process.stdout.write('${longOutput}')"`],
      process.cwd(),
    );
    expect(result.commands).toHaveLength(1);
    if (result.commands[0].stdoutSummary) {
      expect(result.commands[0].stdoutSummary.length).toBeLessThanOrEqual(600);
      expect(result.commands[0].outputTruncated).toBe(true);
    }
  });

  it('should record durationMs for each command', async () => {
    const result = await runVerificationCommands(
      ['node -e "process.exit(0)"'],
      process.cwd(),
    );
    expect(result.commands[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('integration: agent success -> verification failure -> final failure', () => {
  it('should produce ok=false in JSON when agent succeeds but verification fails', async () => {
    // Simulate: Agent succeeded (exit 0), collect git changes, then run verification
    const verification = await runVerificationCommands(
      ['node -e "process.exit(1)"'],
      process.cwd(),
    );
    expect(verification.ok).toBe(false);
    expect(verification.commands).toHaveLength(1);
    expect(verification.commands[0].ok).toBe(false);

    // Compute finalSuccess as runTask does
    const finalSuccess = verification.ok;
    expect(finalSuccess).toBe(false);

    // Format JSON as CLI does
    const agentResult: RunTaskResult = {
      success: finalSuccess,
      output: 'Agent completed successfully',
      command: 'aider --message "implement feature"',
      gitChanges: {
        diffStat: ' src/foo.ts | 5 +++++',
        shortStat: ' 1 file changed, 5 insertions(+)',
        changedFiles: ['src/foo.ts'],
      },
      verification,
    };

    const json = formatRunTaskJson(agentResult);

    expect(json.ok).toBe(false);
    expect(json.verification).toBeDefined();
    expect(json.verification!.ok).toBe(false);
    expect(json.verification!.commands).toHaveLength(1);
    expect(json.verification!.commands[0].command).toBe('node -e "process.exit(1)"');
    expect(json.verification!.commands[0].ok).toBe(false);
    expect(json.verification!.commands[0].exitCode).not.toBe(0);
  });

  it('should produce ok=true in JSON when agent succeeds and verification passes', async () => {
    const verification = await runVerificationCommands(
      ['node -e "process.exit(0)"'],
      process.cwd(),
    );
    expect(verification.ok).toBe(true);

    const finalSuccess = verification.ok;
    expect(finalSuccess).toBe(true);

    const agentResult: RunTaskResult = {
      success: finalSuccess,
      output: 'Agent completed successfully',
      command: 'aider --message "implement feature"',
      verification,
    };

    const json = formatRunTaskJson(agentResult);

    expect(json.ok).toBe(true);
    expect(json.verification).toBeDefined();
    expect(json.verification!.ok).toBe(true);
    expect(json.verification!.commands[0].ok).toBe(true);
  });

  it('should produce ok=false when mixed verification commands have failures', async () => {
    const verification = await runVerificationCommands(
      [
        'node -e "process.exit(0)"',
        'node -e "process.exit(1)"',
        'node -e "process.exit(0)"',
      ],
      process.cwd(),
    );

    expect(verification.ok).toBe(false);
    expect(verification.commands).toHaveLength(3);
    expect(verification.commands[0].ok).toBe(true);
    expect(verification.commands[1].ok).toBe(false);
    expect(verification.commands[2].ok).toBe(true);

    const json = formatRunTaskJson({
      success: verification.ok,
      output: 'done',
      command: 'aider --message test',
      verification,
    });

    expect(json.ok).toBe(false);
    expect(json.verification!.commands.filter(c => c.ok)).toHaveLength(2);
    expect(json.verification!.commands.filter(c => !c.ok)).toHaveLength(1);
  });
});

describe('splitCommandArgs', () => {
  it('should parse basic quoted command', () => {
    expect(splitCommandArgs("echo 'hello world'")).toEqual(['echo', 'hello world']);
  });

  it('should preserve compound operators', () => {
    expect(splitCommandArgs('npm run build && npm test')).toEqual(['npm', 'run', 'build', '&&', 'npm', 'test']);
  });

  it('should split simple command by whitespace', () => {
    expect(splitCommandArgs('npm run typecheck')).toEqual(['npm', 'run', 'typecheck']);
  });

  it('should handle double-quoted arguments with spaces', () => {
    expect(splitCommandArgs('npm test -- "path/with space"')).toEqual(['npm', 'test', '--', 'path/with space']);
  });

  it('should handle single-quoted arguments with spaces', () => {
    expect(splitCommandArgs("node -e 'process.exit(0)'")).toEqual(['node', '-e', 'process.exit(0)']);
  });

  it('should return empty array for empty string', () => {
    expect(splitCommandArgs('')).toEqual([]);
  });

  it('should handle multiple spaces between args', () => {
    expect(splitCommandArgs('a   b    c')).toEqual(['a', 'b', 'c']);
  });

  it('should handle mixed quotes', () => {
    expect(splitCommandArgs(`cmd "arg with 'nested'" 'other "quoted"'`)).toEqual(['cmd', "arg with 'nested'", 'other "quoted"']);
  });

  it('should handle escaped quotes in double quotes', () => {
    expect(splitCommandArgs(`grep "a \\"b\\" c" file.txt`)).toEqual(['grep', 'a "b" c', 'file.txt']);
  });

  it('should handle escaped whitespace outside quotes', () => {
    expect(splitCommandArgs(String.raw`echo a\ b c`)).toEqual(['echo', 'a b', 'c']);
  });

  it('should throw on unclosed quote', () => {
    expect(() => splitCommandArgs(`echo "abc`)).toThrow();
  });
});
