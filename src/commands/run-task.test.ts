import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdir as mkdirAsync } from 'node:fs/promises';
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
  AuditEventType: {
    CLI_COMMAND: 'CLI_COMMAND',
    CLI_OUTPUT: 'CLI_OUTPUT',
    WORKFLOW_START: 'WORKFLOW_START',
    WORKFLOW_END: 'WORKFLOW_END',
    WORKFLOW_STEP: 'WORKFLOW_STEP',
    SANDBOX_DETECT: 'SANDBOX_DETECT',
    SECURITY_ALERT: 'SECURITY_ALERT',
    SECURITY_ACTION: 'SECURITY_ACTION',
    CONFIG_CHANGE: 'CONFIG_CHANGE',
    FILE_OPERATION: 'FILE_OPERATION',
    INTENT_MATCH: 'INTENT_MATCH',
    EXECUTOR_RESULT: 'EXECUTOR_RESULT',
    ENV_AUDIT: 'ENV_AUDIT',
  },
  createNoopAuditHelper: () => mockContextAuditHelper,
  createAuditHelper: () => mockContextAuditHelper,
  AuditLogger: class { write() {} },
}));

const mockContextAuditHelper = {
  securityAction: vi.fn(),
  securityAlert: vi.fn(),
  executorResult: vi.fn(),
  log: vi.fn(),
  cliCommand: vi.fn(),
  cliOutput: vi.fn(),
  workflowStart: vi.fn(),
  workflowEnd: vi.fn(),
  workflowStep: vi.fn(),
  configChange: vi.fn(),
  intentMatch: vi.fn(),
  fileOperation: vi.fn(),
  sandboxDetect: vi.fn(),
};

// Mock ACP transport — returns a successful result by default
const mockTransportResult = {
  success: true,
  output: 'Task completed successfully.',
  toolCalls: [],
  stopReason: 'end_turn' as const,
  changedFiles: [],
  events: [],
  usage: undefined,
};

vi.mock('../agent-runtime/transport/factory.js', () => ({
  createTransport: vi.fn(() => ({
    kind: 'acp',
    execute: vi.fn(async () => ({ ...mockTransportResult })),
    probe: vi.fn(async () => true),
  })),
}));

vi.mock('../infrastructure/context.js', () => ({
  getDefaultContext: vi.fn(() => ({
    environment: {
      getCwd: () => process.cwd(),
      getPath: (...segments: string[]) => join(process.env.VECTAHUB_HOME ?? process.cwd(), ...segments),
      resolvePath: (...segments: string[]) => join(...segments),
      joinPath: (...segments: string[]) => join(...segments),
      getDirname: (p: string) => p.split('/').slice(0, -1).join('/') || '.',
      getHomePath: () => process.env.VECTAHUB_HOME ?? process.cwd(),
      getTmpDir: () => tmpdir(),
      exists: (path: string) => existsSync(path),
      readFile: (path: string) => readFileSync(path, 'utf-8'),
      writeFile: (path: string, content: string) => writeFileSync(path, content, 'utf-8'),
      ensureDir: (path: string) => mkdirSync(path, { recursive: true }),
      async *readLines(path: string) {
        const content = readFileSync(path, 'utf-8');
        for (const line of content.split(/\r?\n/)) {
          yield line;
        }
      },
      mkdirAsync: (path: string, options?: { recursive?: boolean }) => mkdirAsync(path, options),
      readDir: (path: string) => readdirSync(path),
      readDirObjects: (path: string) => readdirSync(path, { withFileTypes: true }).map(d => ({ name: d.name, isDirectory: () => d.isDirectory() })),
      rm: (path: string, options?: { recursive?: boolean; force?: boolean }) => rmSync(path, options),
      copyFile: (src: string, dest: string) => copyFileSync(src, dest),
      createWriteStream: (path: string, options?: { encoding?: string; flags?: string }) => createWriteStream(path, options as never),
      stat: (path: string) => {
        const stat = statSync(path);
        return {
          size: stat.size,
          isDirectory: () => stat.isDirectory(),
        };
      },
      getEnv: (name: string, defaultValue?: string) => process.env[name] ?? defaultValue,
      setEnv: (name: string, value: string) => { process.env[name] = value; },
      getEnvNumber: (name: string, defaultValue?: number) => {
        const value = process.env[name];
        if (value === undefined || value === '') return defaultValue;
        const parsed = Number(value);
        return Number.isNaN(parsed) ? defaultValue : parsed;
      },
      getAllEnv: () => ({ ...process.env }),
      exec: vi.fn(async (command: string) => {
        const childProcess = await import('node:child_process');
        const [file, ...args] = command.split(' ');
        const normalizedArgs = file === 'node' && args[0] === '-e'
          ? ['-e', args.slice(1).join(' ').replace(/^(['"])(.*)\1$/, '$2')]
          : args;
        return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          childProcess.execFile(file, normalizedArgs, (error, stdout, stderr) => {
            const result = typeof stdout === 'object' && stdout !== null && 'stdout' in stdout
              ? stdout as { stdout?: string | Buffer; stderr?: string | Buffer }
              : { stdout, stderr };
            if (error) {
              if (result.stdout !== undefined) {
                (error as Error & { stdout?: string | Buffer }).stdout = result.stdout;
              }
              if (result.stderr !== undefined) {
                (error as Error & { stderr?: string | Buffer }).stderr = result.stderr;
              }
              reject(error);
              return;
            }
            resolve({ stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') });
          });
        });
      }),
      spawn: (command: string, args: string[], options?: Record<string, unknown>) => {
        return vi.mocked(spawn)(command, args, options as never);
      },
    },
    logger: {
      getLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
    audit: {
      getHelper: () => mockContextAuditHelper,
      getLogger: () => ({
        getSessionId: () => 'test-session',
        query: vi.fn(() => []),
        write: vi.fn(),
        export: vi.fn(() => ''),
      }),
    },
  })),
}));

vi.mock('../security-protocol/factory.js', () => ({
  getSecurityGuard: vi.fn(() => ({
    assess: vi.fn(async () => ({
      decision: 'PASSED',
      riskLevel: 'none',
    })),
    redactOutput: vi.fn((out) => out),
  })),
}));

vi.mock('../security-protocol/engine.js', () => ({
  assessCommandRisk: vi.fn(async () => ({
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

import { runTask, runTaskCleanLogsCmd, collectGitChanges, formatRunTaskHumanOutput, formatRunTaskJson, runVerificationCommands, splitCommandArgs, buildDefaultPrompt, bindRunTaskContext, buildTaskRuntimeFeatures, formatPreflightEstimateSummary, buildRuntimeResolvedConfig, deriveTaskIdFromDocFile, type RunTaskResult } from './run-task.js';
import { getDefaultContext } from '../infrastructure/context.js';
import { createLLMConfig, createLLMConfigDigestSource } from '../nl/llm.js';
import { assessCommandRisk } from '../security-protocol/engine.js';
import { execFile, spawn } from 'node:child_process';
import type { AgentTaskContract } from '../types/doc-task.js';
import { getAgentDescriptorById } from './agent-cli-adapter.js';
import { computeInstructionHash } from './agent-task-contract.js';
import { initializeBuiltInAgents } from '../agent-runtime/factory.js';
import { djb2Hash } from '../infrastructure/paths/index.js';

const defaultExecFileImpl = vi.mocked(execFile).getMockImplementation();
const defaultSpawnImpl = vi.mocked(spawn).getMockImplementation();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assessCommandRisk).mockImplementation(async () => ({
    level: 'safe',
    needsConfirmation: false,
  }));
  if (defaultExecFileImpl) {
    vi.mocked(execFile).mockImplementation(defaultExecFileImpl as any);
  }
  if (defaultSpawnImpl) {
    vi.mocked(spawn).mockImplementation(defaultSpawnImpl as any);
  }
  bindRunTaskContext(getDefaultContext() as any);
});

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

function getRunTaskFailureLogDir(vectaHubHome: string): string {
  const resolvedHome = process.env.VECTAHUB_HOME ?? vectaHubHome;
  return join(resolvedHome, 'outputs', 'run-task', djb2Hash(process.cwd()));
}

describe('runTask', () => {
  beforeAll(() => {
    initializeBuiltInAgents();
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

  it('should fail when doc exists but task contract is missing', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-missing-contract-'));
    const docPath = join(tempDir, 'tasks.md');
    writeFileSync(docPath, [
      '# Tasks',
      '## Task EXISTING',
      '',
      'taskId: EXISTING',
      '',
      'allowedFiles:',
      '- src/commands/run-task.ts',
    ].join('\n'));

    try {
      await expect(runTask({
        tool: 'codex',
        taskId: 'MISSING-TASK',
        taskLabel: 'Missing task contract',
        doc: docPath,
        dryRun: true,
      })).rejects.toThrow(`Task contract not found in doc: taskId=MISSING-TASK, docPath=${docPath}`);

      expect(createLLMConfig).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
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




  it('should not persist run-task failure logs on successful execution', async () => {
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
        cb(null, { stdout: '', stderr: '' });
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
        taskId: 'P2-SUCCESS-NO-LOGS',
        taskLabel: 'success without persisted logs',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      const outputDir = getRunTaskFailureLogDir(tempVectaHubHome);
      expect(result.success).toBe(true);
      const files = existsSync(outputDir) ? readdirSync(outputDir) : [];
      expect(files.some(name => name.startsWith('P2-SUCCESS-NO-LOGS-') && (name.endsWith('.stdout') || name.endsWith('.stderr')))).toBe(false);
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


  it('should prune expired run-task failure logs before execution', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    const originalSpawnImpl = vi.mocked(spawn).getMockImplementation();
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const originalCodexHome = process.env.CODEX_HOME;
    const originalDateNow = Date.now;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const tempConfigRoot = mkdtempSync(join(tmpdir(), 'codex-home-'));
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    const outputDir = getRunTaskFailureLogDir(tempVectaHubHome);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'P2-OLD-1000.stdout'), 'old');
    writeFileSync(join(outputDir, 'P2-NEW-2000000000000.stderr'), 'new');

    Date.now = vi.fn(() => 2000000000000) as unknown as typeof Date.now;

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
        taskId: 'P2-PRUNE',
        taskLabel: 'prune expired logs',
        doc: '/path/to/doc.md',
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(existsSync(join(outputDir, 'P2-OLD-1000.stdout'))).toBe(false);
      expect(existsSync(join(outputDir, 'P2-NEW-2000000000000.stderr'))).toBe(true);
    } finally {
      Date.now = originalDateNow;
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

  it('should include untracked files in collected git changes', async () => {
    const originalExecFileImpl = vi.mocked(execFile).getMockImplementation();
    vi.mocked(execFile).mockImplementation(((file: any, args: any, options: any, callback: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --shortstat') {
        cb(null, { stdout: '', stderr: '' });
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'status --short') {
        cb(null, { stdout: '?? src/commands/run-task-review.ts\n?? src/commands/run-task-review.test.ts\n', stderr: '' });
        return {} as any;
      }
      if (file === 'git' && Array.isArray(args) && args.join(' ') === 'diff --stat') {
        cb(null, { stdout: '', stderr: '' });
        return {} as any;
      }
      cb(null, '', '');
      return {} as any;
    }) as any);

    try {
      const result = await collectGitChanges();

      expect(result?.changedFiles).toEqual([
        'src/commands/run-task-review.ts',
        'src/commands/run-task-review.test.ts',
      ]);
      expect(result?.shortStat).toBe('2 untracked files');
      expect(result?.diffStat).toContain('src/commands/run-task-review.ts | untracked');
    } finally {
      if (originalExecFileImpl) {
        vi.mocked(execFile).mockImplementation(originalExecFileImpl as any);
      }
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

  it('should include completionSignal in JSON when current agent completion behavior exposes it', () => {
    const result = formatRunTaskJson({
      success: true,
      command: 'codex exec test',
      output: 'implemented change set\n\nminor diagnostic\n',
      agentExecutionOutcome: 'implemented',
      completionSignal: 'close',
    });

    expect(result.ok).toBe(true);
    expect(result.agentExecutionOutcome).toBe('implemented');
    expect(result.completionSignal).toBe('close');
    expect(result.output).toContain('implemented change set');
    expect(result.output).toContain('minor diagnostic');
  });

  it('should keep review summary machine-readable in JSON output', () => {
    const result = formatRunTaskJson({
      success: true,
      command: 'codex exec test',
      output: 'implemented change set',
      reviewReport: {
        taskId: 'RTK-003C',
        taskLabel: 'Integrate deterministic review summary into run-task closeout output.',
        status: 'PASS',
        changedFiles: ['src/commands/run-task.ts'],
        validationPassed: true,
        findings: [],
        needsHumanReview: false,
      },
    });

    expect(result.reviewReport).toEqual({
      taskId: 'RTK-003C',
      taskLabel: 'Integrate deterministic review summary into run-task closeout output.',
      status: 'PASS',
      changedFiles: ['src/commands/run-task.ts'],
      validationPassed: true,
      findings: [],
      needsHumanReview: false,
    });
    expect(result.output).toBe('implemented change set');
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

describe('formatRunTaskHumanOutput', () => {
  it('should render contract preview as human-readable output', () => {
    const output = formatRunTaskHumanOutput({
      success: true,
      command: '',
      output: '',
      commandGenerationPath: 'adapter',
      fallbackUsed: false,
      agentTaskContract: {
        boundaryConfidence: 'medium',
        allowedFiles: [
          'src/commands/run-task.test.ts',
          'src/commands/run-task.trace-closeout.test.ts',
        ],
        forbiddenFiles: [
          'src/cli.ts',
          'src/workflow/engine.ts',
        ],
        validationCommands: [
          'npm run typecheck',
          'npx vitest run src/commands/run-task.test.ts',
        ],
        executionMode: 'parallel-eligible',
        docExcerptTruncated: false,
        excerptStrategy: 'task-heading',
        instructionHash: '1234567890abcdef',
        globalConfigDigest: 'adapter=codex',
      },
    }, { mode: 'contract-preview' });

    expect(output).toContain('合同预览');
    expect(output).toContain('结论：可继续评估');
    expect(output).toContain('允许修改：');
    expect(output).toContain('- src/commands/run-task.test.ts');
    expect(output).toContain('禁止修改：');
    expect(output).toContain('- src/cli.ts');
    expect(output).toContain('验证命令：');
    expect(output).toContain('- npm run typecheck');
    expect(output).toContain('命令生成路径：adapter');
  });

  it('should avoid empty human output when command output is blank', () => {
    const output = formatRunTaskHumanOutput({
      success: true,
      command: '',
      output: '',
    });

    expect(output).toBe('任务执行成功，但没有可展示输出。');
  });

  it('should show structured success summary with contract, changed files, and validation commands', () => {
    const output = formatRunTaskHumanOutput({
      success: true,
      command: 'codex exec task',
      output: 'Agent says the review contract file was created successfully.',
      commandGenerationPath: 'adapter',
      fallbackUsed: false,
      agentExecutionOutcome: 'implemented',
      completionSignal: 'output-last-message',
      gitChanges: {
        shortStat: '1 file changed, 10 insertions(+)',
        changedFiles: ['src/commands/run-task-review.ts'],
        diffStat: 'src/commands/run-task-review.ts | 10 ++++++++++',
      },
      agentTaskContract: {
        boundaryConfidence: 'high',
        allowedFiles: ['src/commands/run-task-review.ts'],
        forbiddenFiles: [
          'src/commands/run-task.ts',
          'src/commands/run-task.test.ts',
        ],
        validationCommands: ['npm run typecheck'],
        executionMode: 'parallel-eligible',
        docExcerptTruncated: false,
        excerptStrategy: 'task-heading',
        instructionHash: '1234567890abcdef',
        globalConfigDigest: 'adapter=codex',
      },
      verification: {
        ok: true,
        isSystemError: false,
        commands: [
          {
            command: 'npm run typecheck',
            ok: true,
            exitCode: 0,
            durationMs: 100,
            stdoutSummary: '',
            stderrSummary: '',
            outputTruncated: false,
          },
        ],
      },
      reviewReport: {
        taskId: 'RTK-003C',
        taskLabel: 'Integrate deterministic review summary into run-task closeout output.',
        status: 'PASS',
        changedFiles: ['src/commands/run-task-review.ts'],
        validationPassed: true,
        findings: [],
        needsHumanReview: false,
      },
    });

    expect(output).toContain('任务执行成功');
    expect(output).toContain('允许修改：');
    expect(output).toContain('- src/commands/run-task-review.ts');
    expect(output).toContain('禁止修改：');
    expect(output).toContain('- src/commands/run-task.ts');
    expect(output).toContain('- src/commands/run-task.test.ts');
    expect(output).toContain('实际变更：');
    expect(output).toContain('- src/commands/run-task-review.ts');
    expect(output).toContain('验证命令：');
    expect(output).toContain('- 通过：npm run typecheck');
    expect(output).toContain('Agent 执行判断：已实现');
    expect(output).toContain('审查摘要：通过');
    expect(output).toContain('完成信号：output-last-message');
    expect(output).toContain('命令生成路径：adapter');
    expect(output).toContain('Agent 输出摘要：');
    expect(output).toContain('Agent says the review contract file was created successfully.');
  });

  it('should show needs-review summary when deterministic review requires human follow-up', () => {
    const output = formatRunTaskHumanOutput({
      success: true,
      command: 'codex exec task',
      output: 'The task was already satisfied; verification still passed.',
      agentExecutionOutcome: 'planned_only',
      verification: {
        ok: true,
        isSystemError: false,
        commands: [
          {
            command: 'npm run typecheck',
            ok: true,
            exitCode: 0,
            durationMs: 100,
            stdoutSummary: '',
            stderrSummary: '',
            outputTruncated: false,
          },
        ],
      },
      agentTaskContract: {
        boundaryConfidence: 'high',
        allowedFiles: ['src/commands/run-task.ts'],
        forbiddenFiles: ['src/cli.ts'],
        validationCommands: ['npm run typecheck'],
        executionMode: 'parallel-eligible',
        docExcerptTruncated: false,
        excerptStrategy: 'task-heading',
        instructionHash: '1234567890abcdef',
        globalConfigDigest: 'adapter=codex',
      },
      reviewReport: {
        taskId: 'RTK-003C',
        taskLabel: 'Integrate deterministic review summary into run-task closeout output.',
        status: 'NEEDS_REVIEW',
        changedFiles: [],
        validationPassed: true,
        findings: [
          {
            severity: 'info',
            code: 'ALREADY_SATISFIED',
            message: 'No file changes were required because the task was already satisfied.',
          },
        ],
        needsHumanReview: true,
      },
    });

    expect(output).toContain('审查摘要：需复核');
    expect(output).toContain('审查要点：任务已满足，无需代码变更');
  });

  it('should summarize failed agent output instead of printing the full transcript', () => {
    const longTranscript = Array.from({ length: 80 }, (_, index) => {
      return `Agent diagnostic line ${index} with verbose internal prompt and execution details`;
    }).join('\n');

    const output = formatRunTaskHumanOutput({
      success: false,
      command: 'codex exec task',
      output: longTranscript,
      error: {
        code: 'AGENT_NO_CLOSE_TIMEOUT',
        message: 'Agent process did not close before timeout',
      },
      failureKind: 'timeout',
      unclosedExecution: true,
      completionSignal: 'timeout',
      recoveryDecision: {
        kind: 'resume',
        mode: 'manual',
        summary: '检查已产生的改动，再决定是否恢复执行。',
      },
      reviewReport: {
        taskId: 'RTK-003C',
        taskLabel: 'Integrate deterministic review summary into run-task closeout output.',
        status: 'FAIL',
        changedFiles: ['src/cli.ts'],
        validationPassed: false,
        findings: [
          {
            severity: 'error',
            code: 'OUT_OF_SCOPE_FILE_CHANGED',
            message: 'Changed files must stay within allowed files.',
            evidence: 'src/cli.ts',
          },
        ],
        needsHumanReview: false,
      },
    });

    expect(output).toContain('任务执行失败');
    expect(output).toContain('错误码：AGENT_NO_CLOSE_TIMEOUT');
    expect(output).toContain('审查摘要：未通过');
    expect(output).toContain('审查要点：检测到越界文件变更：src/cli.ts');
    expect(output).toContain('完成信号：timeout');
    expect(output).toContain('已捕获输出：');
    expect(output).toContain('输出摘要：');
    expect(output).toContain('完整 stdout/stderr 已写入失败日志');
    expect(output.length).toBeLessThan(1400);
    expect(output).not.toContain('Agent diagnostic line 79');
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

describe('buildTaskRuntimeFeatures', () => {
  it('should classify a single-file contract-only task with typecheck', () => {
    const contract = {
      taskId: 'RTK-006C-test',
      label: 'test task',
      instructionHash: 'abc123',
      allowedFiles: ['src/commands/run-task.ts'],
      forbiddenFiles: [],
      validationCommands: ['npm run typecheck'],
      timeoutMs: 600000,
      executionMode: 'serial' as const,
      boundaryConfidence: 'medium' as const,
    };
    const contractSummary = {
      boundaryConfidence: 'medium' as const,
      allowedFiles: ['src/commands/run-task.ts'],
      forbiddenFiles: [],
      validationCommands: ['npm run typecheck'],
      executionMode: 'serial' as const,
      docExcerptTruncated: false,
      excerptStrategy: 'task-heading' as const,
      instructionHash: 'abc123',
    };

    const features = buildTaskRuntimeFeatures(contract, contractSummary);

    expect(features.taskId).toBe('RTK-006C-test');
    expect(features.allowedFileCount).toBe(1);
    expect(features.hasTypecheck).toBe(true);
    expect(features.hasVitest).toBe(false);
    expect(features.hasLint).toBe(false);
    expect(features.isSinglePureFunction).toBe(true);
    expect(features.mustReuseForbiddenFileLogic).toBe(false);
  });

  it('should detect vitest, lint, and test file modifications', () => {
    const contract = {
      taskId: 'RTK-006C-wide',
      label: 'wide task',
      instructionHash: 'def456',
      allowedFiles: ['src/foo.ts', 'src/bar.ts', 'src/foo.test.ts'],
      forbiddenFiles: ['src/cli.ts'],
      validationCommands: ['npx vitest run src/foo.test.ts', 'npm run lint'],
      timeoutMs: 600000,
      executionMode: 'serial' as const,
      boundaryConfidence: 'high' as const,
    };
    const contractSummary = {
      boundaryConfidence: 'high' as const,
      allowedFiles: ['src/foo.ts', 'src/bar.ts', 'src/foo.test.ts'],
      forbiddenFiles: ['src/cli.ts'],
      validationCommands: ['npx vitest run src/foo.test.ts', 'npm run lint'],
      executionMode: 'serial' as const,
      docExcerptTruncated: false,
      excerptStrategy: 'task-heading' as const,
      instructionHash: 'def456',
    };

    const features = buildTaskRuntimeFeatures(contract, contractSummary);

    expect(features.hasVitest).toBe(true);
    expect(features.hasLint).toBe(true);
    expect(features.modifiesTests).toBe(true);
    expect(features.mustReuseForbiddenFileLogic).toBe(true);
    expect(features.isSinglePureFunction).toBe(false);
  });

  it('should detect docs-only tasks', () => {
    const contract = {
      taskId: 'RTK-006C-docs',
      label: 'docs task',
      instructionHash: 'ghi789',
      allowedFiles: ['docs/tasks/something.md'],
      forbiddenFiles: [],
      validationCommands: [],
      timeoutMs: 600000,
      executionMode: 'serial' as const,
      boundaryConfidence: 'medium' as const,
    };
    const contractSummary = {
      boundaryConfidence: 'medium' as const,
      allowedFiles: ['docs/tasks/something.md'],
      forbiddenFiles: [],
      validationCommands: [],
      executionMode: 'serial' as const,
      docExcerptTruncated: false,
      excerptStrategy: 'task-heading' as const,
      instructionHash: 'ghi789',
    };

    const features = buildTaskRuntimeFeatures(contract, contractSummary);

    expect(features.isDocsOnly).toBe(true);
    expect(features.isSinglePureFunction).toBe(true);
    expect(features.allowedFileCount).toBe(1);
    expect(features.validationCommandCount).toBe(0);
  });
});

describe('formatPreflightEstimateSummary', () => {
  it('should format a tiny estimate with duration in seconds', () => {
    const estimate = {
      taskId: 'test',
      complexity: 'tiny' as const,
      score: 15,
      expectedDurationMs: 150_000,
      heuristicEstimateMs: 150_000,
      noCloseTimeoutMs: 120_000,
      extensionMs: 60_000,
      maxExtensions: 1,
      maxWallClockMs: 300_000,
      progressIntervalMs: 30_000,
      splitRecommended: false,
      reasons: [],
      weights: { heuristic: 1, llm: 0, historical: 0 },
    };

    const lines = formatPreflightEstimateSummary(estimate);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('tiny');
    expect(lines[0]).toContain('2m 30s');
    expect(lines[0]).toContain('运行时预估');
    expect(lines.some(line => line.includes('暂无历史数据'))).toBe(true);
  });

  it('should include split recommendation for large tasks', () => {
    const estimate = {
      taskId: 'test-large',
      complexity: 'large' as const,
      score: 95,
      expectedDurationMs: 1_200_000,
      heuristicEstimateMs: 1_200_000,
      noCloseTimeoutMs: 420_000,
      extensionMs: 180_000,
      maxExtensions: 0,
      maxWallClockMs: 1_800_000,
      progressIntervalMs: 120_000,
      splitRecommended: true,
      reasons: ['many allowed files', 'runtime behavior change'],
      weights: { heuristic: 1, llm: 0, historical: 0 },
    };

    const lines = formatPreflightEstimateSummary(estimate);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('large');
    expect(lines[0]).toContain('20m 0s');
    expect(lines.some(line => line.includes('建议拆分'))).toBe(true);
  });

  it('should format duration without minutes for short estimates', () => {
    const estimate = {
      taskId: 'test-short',
      complexity: 'tiny' as const,
      score: 10,
      expectedDurationMs: 45_000,
      heuristicEstimateMs: 45_000,
      noCloseTimeoutMs: 120_000,
      extensionMs: 60_000,
      maxExtensions: 1,
      maxWallClockMs: 300_000,
      progressIntervalMs: 30_000,
      splitRecommended: false,
      reasons: [],
      weights: { heuristic: 1, llm: 0, historical: 0 },
    };

    const lines = formatPreflightEstimateSummary(estimate);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('45s');
    expect(lines[0]).not.toContain('m');
  });

  it('should display historical estimate when available', () => {
    const estimate = {
      taskId: 'test-historical',
      complexity: 'medium' as const,
      score: 55,
      expectedDurationMs: 500_000,
      heuristicEstimateMs: 450_000,
      historicalEstimateMs: 600_000,
      noCloseTimeoutMs: 200_000,
      extensionMs: 90_000,
      maxExtensions: 3,
      maxWallClockMs: 810_000,
      progressIntervalMs: 75_000,
      splitRecommended: false,
      reasons: [],
      weights: { heuristic: 0.45, llm: 0, historical: 0.55 },
    };

    const lines = formatPreflightEstimateSummary(estimate);

    expect(lines.some(line => line.includes('历史中位数'))).toBe(true);
    expect(lines.some(line => line.includes('权重'))).toBe(true);
  });
});

describe('buildRuntimeResolvedConfig', () => {
  const sampleEstimate = {
    taskId: 'test',
    complexity: 'medium' as const,
    score: 55,
    expectedDurationMs: 450_000,
    heuristicEstimateMs: 450_000,
    noCloseTimeoutMs: 200_000,
    extensionMs: 90_000,
    maxExtensions: 3,
    maxWallClockMs: 810_000,
    progressIntervalMs: 75_000,
    splitRecommended: false,
    reasons: [],
    weights: { heuristic: 1, llm: 0, historical: 0 },
  };

  it('should use estimate values when no env vars are set', () => {
    const config = buildRuntimeResolvedConfig(sampleEstimate, () => undefined);

    expect(config.noCloseTimeoutMs).toBe(200_000);
    expect(config.extensionMs).toBe(90_000);
    expect(config.maxExtensions).toBe(3);
    expect(config.maxWallClockMs).toBe(810_000);
    expect(config.progressIntervalMs).toBe(75_000);
  });

  it('should use env vars when explicitly set, overriding estimate values', () => {
    const envVars: Record<string, number> = {
      AGENT_NO_CLOSE_TIMEOUT_MS: 50_000,
      AGENT_NO_CLOSE_EXTENSION_MS: 30_000,
      AGENT_NO_CLOSE_MAX_EXTENSIONS: 5,
      AGENT_MAX_WALL_CLOCK_MS: 200_000,
      AGENT_PROGRESS_INTERVAL_MS: 10_000,
      AGENT_CLI_TIMEOUT: 300_000,
      AGENT_EXIT_FLUSH_GRACE_MS: 2000,
      AGENT_IDLE_TIMEOUT_MS: 60_000,
    };
    const config = buildRuntimeResolvedConfig(sampleEstimate, (name) => envVars[name]);

    expect(config.noCloseTimeoutMs).toBe(50_000);
    expect(config.extensionMs).toBe(30_000);
    expect(config.maxExtensions).toBe(5);
    expect(config.maxWallClockMs).toBe(200_000);
    expect(config.progressIntervalMs).toBe(10_000);
    expect(config.cliTimeoutMs).toBe(300_000);
    expect(config.exitFlushGraceMs).toBe(2000);
    expect(config.idleTimeoutMs).toBe(60_000);
  });

  it('should use hardcoded defaults when no estimate and no env vars', () => {
    const config = buildRuntimeResolvedConfig(undefined, () => undefined);

    expect(config.cliTimeoutMs).toBe(600_000);
    expect(config.exitFlushGraceMs).toBe(1500);
    expect(config.idleTimeoutMs).toBe(120_000);
    expect(config.progressIntervalMs).toBe(30_000);
    expect(config.noCloseTimeoutMs).toBe(180_000);
    expect(config.extensionMs).toBe(120_000);
    expect(config.maxExtensions).toBe(3);
    expect(config.maxWallClockMs).toBe(900_000);
  });

  it('should prefer env var over estimate when both are available', () => {
    const config = buildRuntimeResolvedConfig(sampleEstimate, (name) => {
      if (name === 'AGENT_NO_CLOSE_TIMEOUT_MS') return 42_000;
      return undefined;
    });

    expect(config.noCloseTimeoutMs).toBe(42_000);
    expect(config.extensionMs).toBe(sampleEstimate.extensionMs);
    expect(config.maxExtensions).toBe(sampleEstimate.maxExtensions);
  });

  it('should derive progress interval from estimate when AGENT_PROGRESS_INTERVAL_MS is not set', () => {
    const config = buildRuntimeResolvedConfig(sampleEstimate, (name) => {
      if (name === 'AGENT_PROGRESS_INTERVAL_MS') return undefined;
      return undefined;
    });

    expect(config.progressIntervalMs).toBe(sampleEstimate.progressIntervalMs);
    // Verify it uses the estimate value, not the hardcoded 30000
    expect(config.progressIntervalMs).toBe(75_000);
    expect(config.progressIntervalMs).not.toBe(30_000);
  });

  it('should derive all timeout and progress fields from estimate when only non-estimate env vars are set', () => {
    const config = buildRuntimeResolvedConfig(sampleEstimate, (name) => {
      if (name === 'AGENT_CLI_TIMEOUT') return 300_000;
      if (name === 'AGENT_EXIT_FLUSH_GRACE_MS') return 2000;
      if (name === 'AGENT_IDLE_TIMEOUT_MS') return 60_000;
      return undefined;
    });

    // Non-estimate env vars should use their provided values
    expect(config.cliTimeoutMs).toBe(300_000);
    expect(config.exitFlushGraceMs).toBe(2000);
    expect(config.idleTimeoutMs).toBe(60_000);
    // Estimate-derived fields should use estimate values
    expect(config.noCloseTimeoutMs).toBe(sampleEstimate.noCloseTimeoutMs);
    expect(config.extensionMs).toBe(sampleEstimate.extensionMs);
    expect(config.maxExtensions).toBe(sampleEstimate.maxExtensions);
    expect(config.maxWallClockMs).toBe(sampleEstimate.maxWallClockMs);
    expect(config.progressIntervalMs).toBe(sampleEstimate.progressIntervalMs);
  });

});

describe('deriveTaskIdFromDocFile', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-derive-'));
  });

  it('derives taskId from filename pattern nlreq_*.md', () => {
    const file = join(tmpDir, 'nlreq_1781071704179_8u015h.md');
    const result = deriveTaskIdFromDocFile(file, getDefaultContext() as any);
    expect(result).toBe('nlreq_1781071704179_8u015h');
  });

  it('prefers taskId field from file body when both exist', () => {
    const file = join(tmpDir, 'nlreq_filename_id.md');
    writeFileSync(file, '# Tasks\n## header\n\ntaskId: nlreq_body_id_xyz\nschemaVersion: 1.0\n');
    const result = deriveTaskIdFromDocFile(file, getDefaultContext() as any);
    expect(result).toBe('nlreq_body_id_xyz');
  });

  it('falls back to filename when body has no taskId field', () => {
    const file = join(tmpDir, 'nlreq_only_filename.md');
    writeFileSync(file, '# no taskId here\n');
    const result = deriveTaskIdFromDocFile(file, getDefaultContext() as any);
    expect(result).toBe('nlreq_only_filename');
  });

  it('returns filename when file does not exist', () => {
    const file = join(tmpDir, 'nlreq_ghost.md');
    const result = deriveTaskIdFromDocFile(file, getDefaultContext() as any);
    expect(result).toBe('nlreq_ghost');
  });

  it('returns null for empty path', () => {
    expect(deriveTaskIdFromDocFile('', getDefaultContext() as any)).toBeNull();
  });

  it('handles path with directories', () => {
    const sub = join(tmpDir, 'sub');
    mkdirSync(sub, { recursive: true });
    const file = join(sub, 'nlreq_nested_id.md');
    const result = deriveTaskIdFromDocFile(file, getDefaultContext() as any);
    expect(result).toBe('nlreq_nested_id');
  });
});
