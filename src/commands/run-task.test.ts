import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  createLLMConfigDigestSource: vi.fn(() => ({ provider: 'openai', model: 'test', temperature: 0.1 })),
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
import { createLLMConfig, createLLMConfigDigestSource } from '../nl/llm.js';
import { execFile, spawn } from 'node:child_process';
import type { AgentTaskContract } from '../types/doc-task.js';
import { getAgentDescriptorById } from './agent-cli-adapter.js';
import { computeInstructionHash } from './agent-task-contract.js';
import { initializeBuiltInAgents } from '../agent-runtime/factory.js';

const defaultExecFileImpl = vi.mocked(execFile).getMockImplementation();
const defaultSpawnImpl = vi.mocked(spawn).getMockImplementation();

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function seedCodexUserHome(rootDir: string): string {
  const codexHome = join(rootDir, 'user-codex-home');
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'config.toml'), 'provider = "right_code"\nmodel = "r1"\n');
  writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ token: 'secret-token' }));
  return codexHome;
}

describe('runTask', () => {
  beforeAll(() => {
    initializeBuiltInAgents();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    if (defaultExecFileImpl) {
      vi.mocked(execFile).mockImplementation(defaultExecFileImpl as any);
    }
    if (defaultSpawnImpl) {
      vi.mocked(spawn).mockImplementation(defaultSpawnImpl as any);
    }
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
      expect(json.agentTaskContract?.instructionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(Object.prototype.hasOwnProperty.call(json.agentTaskContract ?? {}, 'docExcerpt')).toBe(false);
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
      expect(json.agentTaskContract?.instructionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(Object.prototype.hasOwnProperty.call(json.agentTaskContract ?? {}, 'docExcerpt')).toBe(false);
      expect(createLLMConfig).not.toHaveBeenCalled();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should finalize contract preview hash for adapter-backed known tool without loading LLM', async () => {
    const llmModule = await import('../nl/llm.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-4A',
        taskLabel: '合同预览 codex',
        doc: '/path/to/doc.md',
        contractPreview: true,
      });
      const json = formatRunTaskJson(result);

      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.agentTaskContract?.globalConfigDigest).toBe('adapter=codex');
      expect(result.agentTaskContract?.instructionHash).toBe(computeInstructionHash(
        'P2-4A',
        '合同预览 codex',
        '',
        'codex',
        result.agentTaskContract?.allowedFiles,
        result.agentTaskContract?.forbiddenFiles,
        'adapter=codex',
      ));
      expect(json.commandGenerationPath).toBe('adapter');
      expect(createLLMConfig).not.toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
  });

  it('should finalize llm-fallback contract-preview hash from local config metadata without loading runnable LLM config', async () => {
    const llmModule = await import('../nl/llm.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const digestSpy = vi.spyOn(llmModule, 'createLLMConfigDigestSource');

    try {
      const result = await runTask({
        tool: 'unknown-cli',
        taskId: 'P2-4B-Preview',
        taskLabel: '合同预览 fallback',
        doc: '/path/to/doc.md',
        contractPreview: true,
      });
      const json = formatRunTaskJson(result);

      const expectedDigest = 'provider=openai;model=test;temperature=0.1';
      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('llm-fallback');
      expect(result.agentTaskContract?.globalConfigDigest).toBe(expectedDigest);
      expect(result.agentTaskContract?.instructionHash).toBe(computeInstructionHash(
        'P2-4B-Preview',
        '合同预览 fallback',
        '',
        'unknown-cli',
        result.agentTaskContract?.allowedFiles,
        result.agentTaskContract?.forbiddenFiles,
        expectedDigest,
      ));
      expect(json.commandGenerationPath).toBe('llm-fallback');
      expect(createLLMConfig).not.toHaveBeenCalled();
      expect(createLLMConfigDigestSource).toHaveBeenCalled();
      expect(digestSpy).toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
      digestSpy.mockRestore();
    }
  });

  it('should keep contract-preview deterministic when llm-fallback digest source is unavailable', async () => {
    const llmModule = await import('../nl/llm.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    vi.mocked(createLLMConfigDigestSource).mockReturnValueOnce(null);

    try {
      const result = await runTask({
        tool: 'unknown-cli',
        taskId: 'P2-4B-Preview-NoDigest',
        taskLabel: '合同预览 fallback no digest',
        doc: '/path/to/doc.md',
        contractPreview: true,
      });

      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('llm-fallback');
      expect(result.agentTaskContract?.globalConfigDigest).toBeUndefined();
      expect(result.agentTaskContract?.instructionHash).toBe(computeInstructionHash(
        'P2-4B-Preview-NoDigest',
        '合同预览 fallback no digest',
        '',
        'unknown-cli',
        result.agentTaskContract?.allowedFiles,
        result.agentTaskContract?.forbiddenFiles,
        undefined,
      ));
      expect(createLLMConfig).not.toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
  });

  it('should finalize llm-fallback dry-run hash from local config metadata without loading runnable LLM config', async () => {
    const llmModule = await import('../nl/llm.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const digestSpy = vi.spyOn(llmModule, 'createLLMConfigDigestSource');

    try {
      const result = await runTask({
        tool: 'unknown-cli',
        taskId: 'P2-4B',
        taskLabel: '合同预览 fallback',
        doc: '/path/to/doc.md',
        dryRun: true,
      });

      const expectedDigest = 'provider=openai;model=test;temperature=0.1';
      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('llm-fallback');
      expect(result.agentTaskContract?.globalConfigDigest).toBe(expectedDigest);
      expect(result.agentTaskContract?.instructionHash).toBe(computeInstructionHash(
        'P2-4B',
        '合同预览 fallback',
        '',
        'unknown-cli',
        result.agentTaskContract?.allowedFiles,
        result.agentTaskContract?.forbiddenFiles,
        expectedDigest,
      ));
      expect(createLLMConfig).not.toHaveBeenCalled();
      expect(createLLMConfigDigestSource).toHaveBeenCalled();
      expect(digestSpy).toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
      digestSpy.mockRestore();
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
      expect(result.riskAssessment?.enforcement).toBe('blocked');
      expect(vi.mocked(spawn).mock.calls.length).toBe(0);
    } finally {
      if (originalGetSecurityManagerImpl) {
        vi.mocked(getSecurityManager).mockImplementation(originalGetSecurityManagerImpl as any);
      }
    }
  });

  it('should block high-risk validation commands before spawn', async () => {
    const { assessCommandRisk } = await import('../security-protocol/engine.js');
    const riskSpy = vi.mocked(assessCommandRisk);
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    const tempDocDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-doc-'));
    const docPath = join(tempDocDir, 'tasks.md');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    writeFileSync(docPath, [
      '# Tasks',
      '## P2-RISK-VALIDATION 高风险验证命令',
      '修改 `src/commands/run-task.ts`。',
      '补充 `src/commands/run-task.test.ts`。',
      '建议执行：npm run lint',
    ].join('\n'));

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    riskSpy.mockImplementation((() => {
      return {
        level: 'high',
        ruleName: 'danger-validation',
        needsConfirmation: true,
      } as any;
    }) as any);
    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-RISK-VALIDATION',
        taskLabel: 'high risk validation preflight',
        doc: docPath,
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SECURITY_BLOCKED');
      expect(result.riskAssessment?.phase).toBe('verification');
      expect(result.riskAssessment?.needsConfirmation).toBe(true);
      expect(result.riskAssessment?.enforcement).toBe('confirm_required');
      expect(result.riskAssessment?.level).toBe('high');
      expect(vi.mocked(spawn).mock.calls.length).toBe(0);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      rmSync(tempDocDir, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should keep normal validation commands unaffected', async () => {
    const { assessCommandRisk } = await import('../security-protocol/engine.js');
    const riskSpy = vi.mocked(assessCommandRisk);
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    const tempDocDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-doc-'));
    const docPath = join(tempDocDir, 'tasks.md');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    writeFileSync(docPath, [
      '# Tasks',
      '## P2-RISK-VALIDATION-SAFE 普通验证命令',
      '修改 `src/commands/run-task.ts`。',
      '补充 `src/commands/run-task.test.ts`。',
      '建议执行：npm run lint',
    ].join('\n'));

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      if (file === 'npm' && Array.isArray(args) && args.join(' ') === 'run lint') {
        cb(null, '', '');
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        cb(null, '', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    riskSpy.mockImplementation((() => ({
      level: 'safe',
      needsConfirmation: false,
    })) as any);
    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('implemented\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-RISK-VALIDATION-SAFE',
        taskLabel: 'safe validation preflight',
        doc: docPath,
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.riskAssessment?.phase).not.toBe('verification');
      expect(vi.mocked(spawn).mock.calls.length).toBe(1);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      rmSync(tempDocDir, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should mark changed to needs_confirmation on post-execution out-of-scope change', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    const tempDocDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-doc-'));
    const docPath = join(tempDocDir, 'tasks.md');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    writeFileSync(docPath, [
      '# Tasks',
      '## P2-POST-CONFIRM 越界修改',
      '修改 `src/commands/run-task.ts`。',
      '补充 `src/commands/run-task.test.ts`。',
    ].join('\n'));

    let gitShortStatCalls = 0;
    let gitDiffStatCalls = 0;
    let npmCalled = false;
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        gitShortStatCalls += 1;
        if (gitShortStatCalls === 1) {
          cb(null, { stdout: ' 1 file changed, 1 insertion(+)\n', stderr: '' });
        } else {
          cb(null, { stdout: ' 2 files changed, 2 insertions(+)\n', stderr: '' });
        }
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --stat') {
        gitDiffStatCalls += 1;
        if (gitDiffStatCalls === 1) {
          cb(null, { stdout: ' existing.ts | 1 +\n 1 file changed, 1 insertion(+)\n', stderr: '' });
        } else {
          cb(null, { stdout: ' existing.ts | 1 +\n src/out-of-scope.ts | 1 +\n 2 files changed, 2 insertions(+)\n', stderr: '' });
        }
        return {} as any;
      }
      if (file === 'npm') {
        npmCalled = true;
        cb(null, '', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('implemented\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-POST-CONFIRM',
        taskLabel: 'post execution confirmation',
        doc: docPath,
        dryRun: false,
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NEEDS_CONFIRMATION');
      expect(result.riskAssessment?.confirmationSource).toBe('post-execution');
      expect(result.riskAssessment?.enforcement).toBe('confirm_required');
      expect(result.agentExecutionOutcome).toBe('implemented');
      expect(result.gitChanges?.changedFiles).toContain('src/out-of-scope.ts');
      expect(result.verification).toBeUndefined();
      expect(npmCalled).toBe(false);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      rmSync(tempDocDir, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should keep gitChanges when forbidden file is modified and require post-execution confirmation', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    const tempDocDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-doc-'));
    const docPath = join(tempDocDir, 'tasks.md');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    writeFileSync(docPath, [
      '# Tasks',
      '## P2-POST-CONFIRM-FORBIDDEN forbidden',
      '修改 `src/commands/run-task.ts`。',
      '补充 `src/commands/run-task.test.ts`。',
    ].join('\n'));

    let gitShortStatCalls = 0;
    let gitDiffStatCalls = 0;
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        gitShortStatCalls += 1;
        if (gitShortStatCalls === 1) {
          cb(null, { stdout: ' 1 file changed, 1 insertion(+)\n', stderr: '' });
        } else {
          cb(null, { stdout: ' 2 files changed, 2 insertions(+)\n', stderr: '' });
        }
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --stat') {
        gitDiffStatCalls += 1;
        if (gitDiffStatCalls === 1) {
          cb(null, { stdout: ' existing.ts | 1 +\n 1 file changed, 1 insertion(+)\n', stderr: '' });
        } else {
          cb(null, { stdout: ' existing.ts | 1 +\n .env.local | 1 +\n 2 files changed, 2 insertions(+)\n', stderr: '' });
        }
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('implemented\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-POST-CONFIRM-FORBIDDEN',
        taskLabel: 'post execution forbidden',
        doc: docPath,
        dryRun: false,
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NEEDS_CONFIRMATION');
      expect(result.riskAssessment?.confirmationSource).toBe('post-execution');
      expect(result.riskAssessment?.enforcement).toBe('confirm_required');
      expect(result.riskAssessment?.ruleName).toBe('forbidden_files_modified');
      expect(result.gitChanges?.changedFiles).toContain('.env.local');
      expect(result.verification).toBeUndefined();
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      rmSync(tempDocDir, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should distinguish preflight vs post-execution confirmation source', async () => {
    const { getSecurityManager } = await import('../security-protocol/manager.js');
    const originalGetSecurityManagerImpl = vi.mocked(getSecurityManager).getMockImplementation();
    const mockSecurityManager = {
      detectCommand: vi.fn(() => ({
        isDangerous: true,
        severity: 'high',
        rule: { name: 'preflight-high-risk' },
        matchedPattern: 'rm -rf',
      })),
    };
    vi.mocked(getSecurityManager).mockReturnValue(mockSecurityManager as any);

    try {
      const result = await runTask({
        tool: 'aider',
        taskId: 'P2-PREFLIGHT-CONFIRM',
        taskLabel: 'preflight confirm',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SECURITY_BLOCKED');
      expect(result.riskAssessment?.confirmationSource).toBe('preflight');
      expect(result.riskAssessment?.enforcement).toBe('confirm_required');
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
      expect(result.command).toContain('--sandbox workspace-write');
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.fallbackUsed).toBe(false);
      expect(result.agentTaskContract?.globalConfigDigest).toBe('adapter=codex');
      expect(result.agentTaskContract?.instructionHash).toBe(computeInstructionHash(
        'P2-7',
        'adapter path codex',
        '',
        'codex',
        result.agentTaskContract?.allowedFiles,
        result.agentTaskContract?.forbiddenFiles,
        'adapter=codex',
      ));
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
  });

  it('should use gemini adapter path and skip tool discovery/LLM generation', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    try {
      const result = await runTask({
        tool: 'gemini',
        taskId: 'P2-7G',
        taskLabel: 'adapter path gemini',
        doc: '/path/to/doc.md',
        dryRun: true,
      });
      expect(result.command).toContain('gemini -p');
      expect(result.command).not.toContain('--cwd');
      expect(result.command).not.toContain('--prompt');
      expect(result.command).toContain('-y');
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.fallbackUsed).toBe(false);
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      llmSpy.mockRestore();
    }
  });

  it('should use claude adapter path and skip tool discovery/LLM generation', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    try {
      const result = await runTask({
        tool: 'claude',
        taskId: 'P2-7C',
        taskLabel: 'adapter path claude',
        doc: '/path/to/doc.md',
        dryRun: true,
      });
      expect(result.command).toContain('claude code --cwd');
      expect(result.command).toContain('--message');
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
    expect(result.command).toContain('--sandbox workspace-write');
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
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    delete process.env.CODEX_HOME;
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'aider' && Array.isArray(args) && args.join(' ') === '--help') {
        cb(null, 'Usage: aider [options]\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    let capturedEnv: Record<string, string> | undefined;
    vi.mocked(spawn).mockImplementation(((file: any, _args: any, options: any) => {
      capturedEnv = options?.env;
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
      expect(capturedEnv?.CODEX_HOME).toBeUndefined();
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
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

  it('should use claude adapter preflight readyArgs and stable rendered command on normal run', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalClaudeHome = process.env.CLAUDE_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    delete process.env.CLAUDE_HOME;

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'claude' && Array.isArray(args) && args.join(' ') === 'code --help') {
        cb(null, 'Usage: claude code\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('claude run ok\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'claude',
        taskId: 'P2-8C',
        taskLabel: 'adapter run claude',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('adapter');
      expect(result.command).toContain('claude code --cwd');
      expect(result.command).toContain('--message');
      const claudeCalls = vi.mocked(execFile).mock.calls.filter(call => call[0] === 'claude');
      expect(claudeCalls.some(call => Array.isArray(call[1]) && (call[1] as string[]).join(' ') === 'code --help')).toBe(true);
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CLAUDE_HOME', originalClaudeHome);
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

  it('should bootstrap claude runtime home via envPatch on normal run', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalClaudeHome = process.env.CLAUDE_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempClaudeHome = mkdtempSync(join(tmpdir(), 'claude-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CLAUDE_HOME = tempClaudeHome;

    // 创建一个 settings.json 以触发 bootstrap 复制
    writeFileSync(join(tempClaudeHome, 'settings.json'), '{"theme":"dark"}');

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'claude' && Array.isArray(args) && args.join(' ') === 'code --help') {
        cb(null, 'Usage: claude code\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    let capturedEnv: Record<string, string> | undefined;
    vi.mocked(spawn).mockImplementation(((file: any, _args: any, options: any) => {
      capturedEnv = options?.env;
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('claude run ok\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'claude',
        taskId: 'P2-8C-BOOT',
        taskLabel: 'claude bootstrap env test',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('adapter');
      // 核心断言：envPatch 生效
      expect(capturedEnv).toBeDefined();
      expect(capturedEnv!.CLAUDE_HOME).toBeDefined();
      expect(capturedEnv!.CLAUDE_HOME).toContain('agent-homes/claude');
      expect(capturedEnv!.CLAUDE_HOME).not.toBe(tempClaudeHome);
      // 验证 bootstrap 复制了 settings.json
      expect(existsSync(join(capturedEnv!.CLAUDE_HOME, 'settings.json'))).toBe(true);
      expect(readFileSync(join(capturedEnv!.CLAUDE_HOME, 'settings.json'), 'utf8')).toContain('"theme"');
      expect(llmSpy).not.toHaveBeenCalled();
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CLAUDE_HOME', originalClaudeHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempClaudeHome, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
      llmSpy.mockRestore();
    }
  });

  it('should keep claude on inherited user environment when bootstrap source is missing', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const llmSpy = vi.spyOn(llmModule, 'createLLMConfig');
    const toolCacheManager = { discoverToolHelp: vi.fn() };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalClaudeHome = process.env.CLAUDE_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    delete process.env.CLAUDE_HOME;

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'claude' && Array.isArray(args) && args.join(' ') === 'code --help') {
        cb(null, 'Usage: claude code\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    let capturedEnv: Record<string, string> | undefined;
    vi.mocked(spawn).mockImplementation(((file: any, _args: any, options: any) => {
      capturedEnv = options?.env;
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('claude run ok\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'claude',
        taskId: 'P2-8C-INHERIT',
        taskLabel: 'claude inherit env test',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.commandGenerationPath).toBe('adapter');
      expect(capturedEnv).toBeDefined();
      expect(capturedEnv!.CLAUDE_HOME).toBeUndefined();
      expect(llmSpy).not.toHaveBeenCalled();
      expect(toolCacheManager.discoverToolHelp).not.toHaveBeenCalled();
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CLAUDE_HOME', originalClaudeHome);
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

  it('should mark codex planned-only output as non-implemented and skip verification success path', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);
    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('按 AGENTS.md 要求，我先给出实施计划，暂不执行修改。\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-PLAN',
        taskLabel: 'planned only',
        doc: '/path/to/doc.md',
        dryRun: false,
      });
      expect(result.success).toBe(false);
      expect(result.agentExecutionOutcome).toBe('planned_only');
      expect(result.error).toEqual({
        code: 'AGENT_PLANNED_ONLY',
        message: 'Agent 仅输出计划，未执行实现',
      });
      expect(result.verification).toBeUndefined();
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should bootstrap codex runtime home from minimal config files and surface stderr when agent exits non-zero', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    let capturedEnv: Record<string, string> | undefined;
    vi.mocked(spawn).mockImplementation(((file: any, args: any, options: any) => {
      capturedEnv = options?.env;
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stderr.write('mock codex stderr\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 1);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-CODEX-ERR',
        taskLabel: 'stderr surfaced',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('mock codex stderr');
      expect(result.error?.code).toBe('AGENT_FAILED');
      expect(capturedEnv?.CODEX_HOME).toContain('agent-homes/codex');
      expect(capturedEnv?.CODEX_HOME).not.toBe(process.env.CODEX_HOME);
      expect(readFileSync(join(capturedEnv!.CODEX_HOME, 'config.toml'), 'utf8')).toContain('provider = "right_code"');
      expect(JSON.parse(readFileSync(join(capturedEnv!.CODEX_HOME, 'auth.json'), 'utf8'))).toEqual({ token: 'secret-token' });
      expect(existsSync(join(capturedEnv!.CODEX_HOME, 'state.db'))).toBe(false);
      expect(existsSync(join(capturedEnv!.CODEX_HOME, 'logs'))).toBe(false);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should classify agent io/network failures as AGENT_SYSTEM_ERROR', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stderr.write('IO error: Operation not permitted\nfailed to connect to websocket\n');
        child.stdout.end();
        child.stderr.end();
        setImmediate(() => {
          child.emit('close', 1);
        });
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-CODEX-SYSERR',
        taskLabel: 'system error classified',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AGENT_SYSTEM_ERROR');
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should treat exit-0 environment-blocked codex output as AGENT_SYSTEM_ERROR and short-circuit verification', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    const tempDocDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-doc-'));
    const docPath = join(tempDocDir, 'tasks.md');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    writeFileSync(docPath, [
      '# Tasks',
      '## P2-CODEX-SOFT-SYSERR 环境阻塞',
      '修改 `src/commands/run-task.ts`。',
      '补充 `src/commands/run-task.test.ts`。',
    ].join('\n'));

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('本地命令工具无法启动，无法读取仓库代码。\n');
        child.stdout.write('任务未落地，当前被执行环境阻塞；验证未执行。\n');
        child.stderr.write('sandbox-exec: sandbox_apply: Operation not permitted\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-CODEX-SOFT-SYSERR',
        taskLabel: 'soft system error classified',
        doc: docPath,
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.agentExecutionOutcome).toBe('implemented');
      expect(result.error?.code).toBe('AGENT_SYSTEM_ERROR');
      expect(result.verification).toBeUndefined();
      const npmCalls = vi.mocked(execFile).mock.calls.filter(call => call[0] === 'npm');
      expect(npmCalls).toEqual([]);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      rmSync(tempDocDir, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should classify real tool-layer blocked codex wording as AGENT_SYSTEM_ERROR and skip verification', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    const tempDocDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-doc-'));
    const docPath = join(tempDocDir, 'tasks.md');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    writeFileSync(docPath, [
      '# Tasks',
      '## P2-CODEX-TOOL-LAYER-BLOCK 工具层阻断',
      '修改 `src/commands/run-task.ts`。',
      '补充 `src/commands/run-task.test.ts`。',
    ].join('\n'));

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('当前被环境阻塞：本地命令/文件访问工具不可用，无法继续实施或验证。\n');
        child.stdout.write('无法读取现有代码，也无法修改文件或运行建议验证命令。\n');
        child.stdout.write('本次实际修改文件：无。\n');
        child.stderr.write('sandbox-exec: sandbox_apply: Operation not permitted\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-CODEX-TOOL-LAYER-BLOCK',
        taskLabel: 'tool layer block classified',
        doc: docPath,
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.agentExecutionOutcome).toBe('implemented');
      expect(result.error?.code).toBe('AGENT_SYSTEM_ERROR');
      expect(result.verification).toBeUndefined();
      const npmCalls = vi.mocked(execFile).mock.calls.filter(call => call[0] === 'npm');
      expect(npmCalls).toEqual([]);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      rmSync(tempDocDir, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should settle on exit stream drain when close event never arrives', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        cb(null, '', '');
        return {} as any;
      }
      if (file === 'npm') {
        cb(null, '', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('implemented\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('exit', 0, null);
      });
      return child;
    }) as any);

    try {
      const raced = await Promise.race([
        runTask({
          tool: 'codex',
          taskId: 'P2-CODEX-EXIT-NO-CLOSE',
          taskLabel: 'exit without close',
          doc: '/path/to/doc.md',
          dryRun: false,
        }).then(result => ({ kind: 'result' as const, result })),
        new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 3000)),
      ]);

      expect(raced.kind).toBe('result');
      if (raced.kind === 'result') {
        expect(raced.result.success).toBe(true);
      }
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should keep gitChanges and skip verification when timeout happens before closeout', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    let gitShortStatCalls = 0;
    let gitDiffStatCalls = 0;
    let npmCalled = false;
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        gitShortStatCalls += 1;
        if (gitShortStatCalls === 1) {
          cb(null, { stdout: ' 1 file changed, 1 insertion(+)\n', stderr: '' });
        } else {
          cb(null, { stdout: ' 2 files changed, 3 insertions(+)\n', stderr: '' });
        }
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --stat') {
        gitDiffStatCalls += 1;
        if (gitDiffStatCalls === 1) {
          cb(null, { stdout: ' existing.ts | 1 +\n 1 file changed, 1 insertion(+)\n', stderr: '' });
        } else {
          cb(null, { stdout: ' existing.ts | 1 +\n src/commands/run-task.ts | 2 ++\n 2 files changed, 3 insertions(+)\n', stderr: '' });
        }
        return {} as any;
      }
      if (file === 'npm') {
        npmCalled = true;
        cb(null, '', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('task wrote files but process did not close yet\n');
        child.stdout.end();
        child.stderr.end();
        const timeoutError = new Error('Agent CLI timeout after 600000ms');
        (timeoutError as Error & { code?: string; completionSignal?: string }).code = 'TIMEOUT';
        (timeoutError as Error & { code?: string; completionSignal?: string }).completionSignal = 'timeout';
        child.emit('error', timeoutError);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-CODEX-TIMEOUT-GIT',
        taskLabel: 'timeout with git changes',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.agentExecutionOutcome).toBe('implemented');
      expect(result.gitChanges).toBeDefined();
      expect(result.gitChanges?.changedFiles).toContain('src/commands/run-task.ts');
      expect(result.verification).toBeUndefined();
      expect(result.failureKind).toBe('timeout');
      expect(result.unclosedExecution).toBe(true);
      expect(result.completionSignal).toBe('timeout');
      expect(result.recoveryDecision?.kind).toBe('suggest_fix');
      expect(npmCalled).toBe(false);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
    }
  });

  it('should keep timeout failure without gitChanges and still skip verification', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    let npmCalled = false;
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
        cb(null, 'Usage: codex exec\n', '');
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        cb(null, { stdout: '', stderr: '' });
        return {} as any;
      }
      if (file === 'npm') {
        npmCalled = true;
        cb(null, '', '');
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    vi.mocked(spawn).mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      process.nextTick(() => {
        child.stdout.write('timeout before any durable side effect\n');
        child.stdout.end();
        child.stderr.end();
        const timeoutError = new Error('Agent CLI timeout after 600000ms');
        (timeoutError as Error & { code?: string; completionSignal?: string }).code = 'TIMEOUT';
        (timeoutError as Error & { code?: string; completionSignal?: string }).completionSignal = 'timeout';
        child.emit('error', timeoutError);
      });
      return child;
    }) as any);

    try {
      const result = await runTask({
        tool: 'codex',
        taskId: 'P2-CODEX-TIMEOUT-NO-GIT',
        taskLabel: 'timeout without git changes',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.gitChanges).toBeUndefined();
      expect(result.agentExecutionOutcome).toBeUndefined();
      expect(result.verification).toBeUndefined();
      expect(result.failureKind).toBe('timeout');
      expect(result.unclosedExecution).toBe(false);
      expect(result.completionSignal).toBe('timeout');
      expect(result.recoveryDecision?.kind).toBe('retry_direct');
      expect(npmCalled).toBe(false);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
      if (originalSpawnImpl) {
        vi.mocked(spawn).mockImplementation(originalSpawnImpl as any);
      }
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

  it('should send finalized instructionHash to LLM contract payload', async () => {
    const llmModule = await import('../nl/llm.js');
    const cacheManagerModule = await import('../cli-tools/discovery/cache-manager.js');
    const originalCompleteRaw = llmModule.LLMClient.prototype.completeRaw;
    const toolCacheManager = { discoverToolHelp: vi.fn(() => ({
      toolName: 'unknown-cli',
      version: '1.0.0',
      helpOutput: 'Usage: unknown-cli [options]',
      capabilities: [],
      discoveredAt: '2026-05-10T00:00:00Z',
    })) };
    vi.mocked(cacheManagerModule.getToolCacheManager).mockReturnValue(toolCacheManager as any);

    let capturedVars: Record<string, string> | undefined;
    llmModule.LLMClient.prototype.completeRaw = vi.fn(async (_promptId, _instruction, vars) => {
      capturedVars = vars as Record<string, string>;
      return '{"command": "unknown-cli", "args": ["--message", "ok"], "explanation": "ok"}';
    });

    try {
      const result = await runTask({
        tool: 'unknown-cli',
        taskId: 'P2-11H',
        taskLabel: 'llm hash consistency',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.commandGenerationPath).toBe('llm-fallback');
      expect(capturedVars).toBeDefined();
      const contractPayload = JSON.parse(capturedVars!.agentTaskContract) as { instructionHash: string };
      const summaryPayload = JSON.parse(capturedVars!.agentTaskContractSummary) as {
        instructionHash: string;
        globalConfigDigest?: string;
      };
      expect(contractPayload.instructionHash).toBe(summaryPayload.instructionHash);
      expect(summaryPayload.globalConfigDigest).toContain('provider=openai;');
      const initialHash = computeInstructionHash(
        'P2-11H',
        'llm hash consistency',
        '',
        undefined,
        (contractPayload as any).allowedFiles,
        (contractPayload as any).forbiddenFiles,
      );
      expect(contractPayload.instructionHash).not.toBe(initialHash);
      expect(result.agentTaskContract?.instructionHash).toBe(summaryPayload.instructionHash);
    } finally {
      llmModule.LLMClient.prototype.completeRaw = originalCompleteRaw;
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
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --sandbox workspace-write --help') {
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
      expect(result.output).toContain('未通过就绪检查');
      const codexCalls = vi.mocked(execFile).mock.calls.filter(call => call[0] === 'codex');
      expect(codexCalls.some(call => Array.isArray(call[1]) && (call[1] as string[]).join(' ') === 'exec --sandbox workspace-write --help')).toBe(true);
      expect(vi.mocked(spawn).mock.calls.length).toBe(0);
    } finally {
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
    }
  });

  it('should consume descriptor readyArgs for adapter preflight before spawn', async () => {
    const descriptor = getAgentDescriptorById('codex');
    const originalReadyArgs = descriptor?.preflightSpec.readyArgs;
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);
    if (descriptor) {
      descriptor.preflightSpec.readyArgs = ['exec', '--full-auto', '--help'];
    }

    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'codex' && Array.isArray(args) && args.join(' ') === 'exec --full-auto --help') {
        cb(new Error('not ready'));
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
        taskId: 'P2-10R',
        taskLabel: 'preflight ready negative',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('未通过就绪检查');
      const codexCalls = vi.mocked(execFile).mock.calls.filter(call => call[0] === 'codex');
      expect(codexCalls.some(call => Array.isArray(call[1]) && (call[1] as string[]).join(' ') === 'exec --full-auto --help')).toBe(true);
      expect(vi.mocked(spawn).mock.calls.length).toBe(0);
    } finally {
      if (descriptor) {
        descriptor.preflightSpec.readyArgs = originalReadyArgs;
      }
      restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
      restoreEnvVar('CODEX_HOME', originalCodexHome);
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
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
      instructionHash: 'abc123abc123abc1',
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
      instructionHash: 'abc123abc123abc2',
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
      instructionHash: 'abc123abc123abc3',
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
      instructionHash: 'abc123abc123abc4',
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

  it('should return only new files compared with baseline snapshot', async () => {
    const baseline = {
      shortStat: '1 file changed',
      diffStat: 'existing.ts | 2 ++',
      changedFiles: ['existing.ts'],
    };
    const result = await collectGitChanges(baseline as any);
    expect(result === null || typeof result === 'object').toBe(true);
    if (result) {
      expect(result.changedFiles).not.toContain('existing.ts');
    }
  });
});

describe('formatRunTaskJson', () => {
  it('should prefer concise user-visible summary over full execution chain on success', () => {
    const noisyOutput = [
      'Implemented run-task summary handling.',
      'Updated tests and verified output contract.',
      'Task boundary contract:',
      '允许修改范围：',
      'session_id: sess_123456',
      'prompt: Please inspect the following execution chain',
      'messages: [{"role":"user","content":"very long prompt"}]',
      'trace: cli.run-task.spawnAgent',
      'stdout: full chain log line',
    ].join('\n');

    const result = formatRunTaskJson({
      success: true,
      command: 'codex exec test',
      output: noisyOutput,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain('Implemented run-task summary handling.');
    expect(result.output).toContain('Updated tests and verified output contract.');
    expect(result.output).not.toContain('Task boundary contract');
    expect(result.output).not.toContain('session_id');
    expect(result.output).not.toContain('prompt:');
    expect(result.output).not.toContain('messages:');
    expect(result.output).not.toContain('trace:');
    expect(result.output).not.toContain('stdout:');
    expect(result.displayOutput).toBe(result.output);
    expect(result.output.length).toBeLessThan(300);
  });

  it('should keep timeout failure semantics unchanged while exposing concise display output', () => {
    const result = formatRunTaskJson({
      success: false,
      command: 'codex exec test',
      output: 'Agent CLI timeout after 600000ms\ntrace: cli.run-task.spawnAgent',
      failureKind: 'timeout',
      unclosedExecution: true,
      completionSignal: 'timeout',
      recoveryDecision: {
        kind: 'suggest_fix',
        mode: 'confirm_required',
        summary: '任务超时但存在代码变更，建议先检查并补全收口。',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.output).toContain('Agent CLI timeout after 600000ms');
    expect(result.output).not.toContain('trace:');
    expect(result.displayOutput).toBe(result.output);
    expect(result.failureKind).toBe('timeout');
    expect(result.unclosedExecution).toBe(true);
    expect(result.completionSignal).toBe('timeout');
    expect(result.recoveryDecision?.kind).toBe('suggest_fix');
  });

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

  it('should include structured recovery fields in JSON when present', () => {
    const result = formatRunTaskJson({
      success: false,
      command: 'codex exec test',
      output: 'Agent CLI timeout after 600000ms',
      failureKind: 'timeout',
      unclosedExecution: false,
      completionSignal: 'timeout',
      recoveryDecision: {
        kind: 'retry_direct',
        mode: 'confirm_required',
        summary: '任务超时且未产生代码变更，可能是偶发执行失败，建议直接重试。',
      },
    });

    expect(result.failureKind).toBe('timeout');
    expect(result.unclosedExecution).toBe(false);
    expect(result.completionSignal).toBe('timeout');
    expect(result.recoveryDecision).toEqual({
      kind: 'retry_direct',
      mode: 'confirm_required',
      summary: '任务超时且未产生代码变更，可能是偶发执行失败，建议直接重试。',
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

  it('should include agentExecutionOutcome in JSON when present', () => {
    const result = formatRunTaskJson({
      success: false,
      command: 'codex exec test',
      output: '按 AGENTS.md 要求，我先给出实施计划，暂不执行修改。',
      agentExecutionOutcome: 'planned_only',
      error: {
        code: 'AGENT_PLANNED_ONLY',
        message: 'Agent 仅输出计划，未执行实现',
      },
    });

    expect(result.agentExecutionOutcome).toBe('planned_only');
    expect(result.error).toEqual({
      code: 'AGENT_PLANNED_ONLY',
      message: 'Agent 仅输出计划，未执行实现',
    });
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

  it('should mark shell command-not-found as system error', async () => {
    const result = await runVerificationCommands(
      ['sh -c "missing_binary_for_test_123"'],
      process.cwd(),
    );
    expect(result.ok).toBe(false);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].exitCode).toBe(127);
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
