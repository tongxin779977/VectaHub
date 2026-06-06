import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import {
  deriveAgentTaskBoundary,
  decideAgentTaskConcurrency,
  deriveDocExcerpt,
  deriveValidationCommands,
  normalizeAgentTaskFiles,
} from './agent-task-contract.js';
import type { AgentTaskContract } from '../types/doc-task.js';

describe('deriveDocExcerpt', () => {
  beforeEach(() => {
    resetDefaultContext();
  });

  function withTempDoc(content: string): { path: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'vectahub-doc-excerpt-'));
    const path = join(dir, 'doc.md');
    writeFileSync(path, content, 'utf8');
    return {
      path,
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  }

  it('优先按 task heading 提取片段', async () => {
    const doc = [
      '# Intro',
      '开头',
      '## P2-1 AgentTaskContract 类型',
      '这里是目标任务内容',
      '继续内容',
      '## P2-2 其他任务',
      '其他内容',
    ].join('\n');

    const temp = withTempDoc(doc);
    try {
      const result = await deriveDocExcerpt(getDefaultContext(), { docPath: temp.path, taskId: 'P2-1', label: 'AgentTaskContract 类型' });
      expect(result.strategy).toBe('task-heading');
      expect(result.excerpt).toContain('## P2-1 AgentTaskContract 类型');
      expect(result.excerpt).not.toContain('## P2-2 其他任务');
    } finally {
      temp.cleanup();
    }
  });

  it('heading 缺失时按 taskId window 回退', async () => {
    const doc = `前文\n任务标识在这里 P2-9\n后文`;
    const temp = withTempDoc(doc);
    try {
      const result = await deriveDocExcerpt(getDefaultContext(), { docPath: temp.path, taskId: 'P2-9', label: '不存在的标题' });
      expect(result.strategy).toBe('task-id-window');
      expect(result.excerpt).toContain('P2-9');
    } finally {
      temp.cleanup();
    }
  });

  it('taskId 缺失时按 label window 回退', async () => {
    const doc = `前文\n这里描述 agent 合同边界\n后文`;
    const temp = withTempDoc(doc);
    try {
      const result = await deriveDocExcerpt(getDefaultContext(), { docPath: temp.path, taskId: 'P2-100', label: 'agent 合同边界' });
      expect(result.strategy).toBe('label-window');
      expect(result.excerpt).toContain('agent 合同边界');
    } finally {
      temp.cleanup();
    }
  });

  it('taskId 和 label 都缺失时使用 head fallback', async () => {
    const doc = 'abcdefg';
    const temp = withTempDoc(doc);
    try {
      const result = await deriveDocExcerpt(getDefaultContext(), { docPath: temp.path, taskId: 'X-1', label: 'YYY' });
      expect(result.strategy).toBe('head-fallback');
      expect(result.excerpt).toBe(`${doc}\n`);
    } finally {
      temp.cleanup();
    }
  });

  it('docExcerpt 超长时会截断', async () => {
    const doc = '# P2-1\n' + 'a'.repeat(100);
    const temp = withTempDoc(doc);
    try {
      const result = await deriveDocExcerpt(getDefaultContext(), { docPath: temp.path, taskId: 'P2-1', label: 'P2-1', maxChars: 20 });
      expect(result.truncated).toBe(true);
      expect(result.excerpt.length).toBe(20);
    } finally {
      temp.cleanup();
    }
  });
});

describe('normalizeAgentTaskFiles', () => {
  it('路径去重/越界过滤/绝对路径归一/数量限制', () => {
    const projectRoot = '/repo/project';
    const many = Array.from({ length: 120 }, (_, index) => `src/m${index}.ts`);
    const files = [
      '',
      '   ',
      'src/a.ts',
      './src/a.ts',
      '../outside.ts',
      '/repo/project/src/b.ts',
      '/repo/other/c.ts',
      ...many,
    ];

    const result = normalizeAgentTaskFiles({ files, projectRoot });
    expect(result).toContain('src/a.ts');
    expect(result).toContain('src/b.ts');
    expect(result.find(path => path.includes('outside'))).toBeUndefined();
    expect(result.find(path => path.startsWith('../'))).toBeUndefined();
    expect(result.length).toBe(100);
  });

  it('兼容 Windows 风格路径分隔符', () => {
    const result = normalizeAgentTaskFiles({
      files: ['src\\commands\\run-task.ts', '.\\packages\\vectahub-vscode-extension\\src\\extension.ts'],
      projectRoot: '/repo/project',
    });

    expect(result).toEqual([
      'src/commands/run-task.ts',
      'packages/vectahub-vscode-extension/src/extension.ts',
    ]);
  });
});

describe('deriveAgentTaskBoundary', () => {
  it('从文档片段中提取确定性文件边界', () => {
    const boundary = deriveAgentTaskBoundary({
      docExcerpt: [
        '修改 `src/commands/run-task.ts`。',
        '补充 src/commands/run-task.test.ts。',
        '不要碰 ../outside.ts。',
      ].join('\n'),
      label: '接入 run-task contract',
      projectRoot: '/repo/project',
    });

    expect(boundary.boundaryConfidence).toBe('medium');
    expect(boundary.allowedFiles).toEqual([
      'src/commands/run-task.ts',
      'src/commands/run-task.test.ts',
    ]);
    expect(boundary.validationCommands).toEqual([
      'npm test -- src/commands/run-task.test.ts --run',
      'npm run typecheck',
    ]);
    expect(boundary.forbiddenFiles).toContain('.env');
  });

  it('优先使用项目真实 type-check 脚本', () => {
    const boundary = deriveAgentTaskBoundary({
      docExcerpt: '修改 `src/commands/run-task.ts`。',
      label: '接入 run-task contract',
      projectRoot: '/repo/project',
      packageScripts: ['type-check', 'test'],
    });

    expect(boundary.validationCommands).toEqual(['npm run type-check']);
  });

  it('无法提取文件时降级为未知边界', () => {
    const boundary = deriveAgentTaskBoundary({
      docExcerpt: '只描述目标，不给文件路径。',
      label: '优化执行体验',
      projectRoot: '/repo/project',
    });

    expect(boundary.boundaryConfidence).toBe('none');
    expect(boundary.parallelEligible).toBe(false);
    expect(boundary.allowedFiles).toEqual([]);
    expect(boundary.validationCommands).toEqual(['npm run typecheck']);
  });
});

describe('deriveValidationCommands', () => {
  it('按规则推导验证命令', () => {
    const commands = deriveValidationCommands({
      allowedFiles: [
        'src/commands/agent-task-contract.test.ts',
        'src/commands/agent-task-contract.ts',
        'packages/vectahub-vscode-extension/src/views/tasksView.ts',
      ],
      taskLabel: 'P2 阶段 1',
    });
    expect(commands).toEqual([
      'npm test -- src/commands/agent-task-contract.test.ts --run',
      'npm run typecheck',
      'npm run compile -w packages/vectahub-vscode-extension',
    ]);
  });

  it('在缺少 typecheck 时回退到 type-check', () => {
    const commands = deriveValidationCommands({
      allowedFiles: ['src/commands/agent-task-contract.ts'],
      taskLabel: 'P2 阶段 1',
      packageScripts: ['type-check'],
    });
    expect(commands).toEqual(['npm run type-check']);
  });
});

describe('decideAgentTaskConcurrency', () => {
  function buildContract(overrides: Partial<AgentTaskContract>): AgentTaskContract {
    return {
      taskId: 'T-1',
      label: '任务',
      instructionHash: 'abc123abc123abc1',
      allowedFiles: ['src/a.ts'],
      forbiddenFiles: [],
      validationCommands: ['npm run typecheck'],
      timeoutMs: 60_000,
      executionMode: 'parallel-eligible',
      boundaryConfidence: 'high',
      ...overrides,
    };
  }

  it('unknown/overlap/isolated-required 时串行', () => {
    const unknown = decideAgentTaskConcurrency([
      buildContract({ taskId: 'T-1', boundaryConfidence: 'none' }),
      buildContract({ taskId: 'T-2', allowedFiles: ['src/b.ts'] }),
    ]);
    expect(unknown.mode).toBe('serial');

    const overlap = decideAgentTaskConcurrency([
      buildContract({ taskId: 'T-1', allowedFiles: ['src/a.ts'] }),
      buildContract({ taskId: 'T-2', allowedFiles: ['src/a.ts'] }),
    ]);
    expect(overlap.mode).toBe('serial');

    const isolated = decideAgentTaskConcurrency([
      buildContract({ taskId: 'T-1' }),
      buildContract({ taskId: 'T-2', executionMode: 'isolated-required', allowedFiles: ['src/b.ts'] }),
    ]);
    expect(isolated.mode).toBe('serial');
  });

  it('medium/high 且无重叠时并行', () => {
    const result = decideAgentTaskConcurrency([
      buildContract({ taskId: 'T-1', boundaryConfidence: 'medium', allowedFiles: ['src/a.ts'] }),
      buildContract({ taskId: 'T-2', boundaryConfidence: 'high', allowedFiles: ['src/b.ts'] }),
    ]);
    expect(result.mode).toBe('parallel');
    expect(result.groups).toEqual([['T-1', 'T-2']]);
  });
});
