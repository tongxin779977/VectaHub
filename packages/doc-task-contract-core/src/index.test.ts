import { describe, expect, it } from 'vitest';
import {
  buildGlobalConfigDigest,
  computeInstructionHash,
  decideAgentTaskConcurrency,
  deriveDocExcerptFromText,
  deriveDocExcerptFromTextSync,
  deriveValidationCommands,
  normalizeAgentTaskFiles,
} from './index.js';

describe('doc-task-contract-core', () => {
  it('instructionHash 因子顺序稳定', () => {
    const base = {
      taskId: 'P2-1',
      label: '收敛合同',
      docExcerpt: '## P2-1 收敛合同\n修改 src/a.ts\n',
      tool: 'codex',
      allowedFiles: ['src/b.ts', 'src/a.ts'],
      forbiddenFiles: ['.env', '.git'],
      globalConfigDigest: 'model=test;temperature=0.1',
    };
    expect(computeInstructionHash(base)).toBe(
      computeInstructionHash({ ...base, allowedFiles: [...base.allowedFiles].reverse() }),
    );
  });

  it('instructionHash 对数组内容使用结构化编码，避免 join 碰撞', () => {
    const common = {
      taskId: 'P2-1',
      label: '收敛合同',
      docExcerpt: 'excerpt',
      tool: 'codex',
      forbiddenFiles: ['.env'],
      globalConfigDigest: 'model=test;temperature=0.1',
    };

    const hashA = computeInstructionHash({
      ...common,
      allowedFiles: ['a,b', 'c'],
    });
    const hashB = computeInstructionHash({
      ...common,
      allowedFiles: ['a', 'b,c'],
    });

    expect(hashA).not.toBe(hashB);
  });

  it('digest 构造稳定', () => {
    expect(buildGlobalConfigDigest({ model: 'test', temperature: 0.1 })).toBe('model=test;temperature=0.1');
    expect(buildGlobalConfigDigest({})).toBe('model=unknown;temperature=default');
  });

  it('路径和验证命令推导稳定', () => {
    expect(normalizeAgentTaskFiles({
      files: ['./src/a.ts', '/repo/project/src/b.ts', '../x.ts'],
      projectRoot: '/repo/project',
    })).toEqual(['src/a.ts', 'src/b.ts']);

    expect(deriveValidationCommands({
      allowedFiles: ['src/a.test.ts', 'packages/vectahub-vscode-extension/src/x.ts'],
      taskLabel: 't',
    })).toEqual([
      'npm test -- src/a.test.ts --run',
      'npm run typecheck',
      'npm run compile -w packages/vectahub-vscode-extension',
    ]);
  });

  it('验证命令优先匹配项目真实 type-check 脚本名', () => {
    expect(deriveValidationCommands({
      allowedFiles: ['src/a.ts'],
      taskLabel: 't',
      packageScripts: ['type-check', 'test'],
    })).toEqual(['npm run type-check']);
  });

  it('支持 Windows 盘符与 UNC 绝对路径，并拒绝项目外路径', () => {
    expect(normalizeAgentTaskFiles({
      files: [
        'C:\\repo\\project\\src\\a.ts',
        'C:\\repo\\project\\docs\\plan.md',
        'D:\\repo\\project\\src\\outside.ts',
      ],
      projectRoot: 'C:\\repo\\project',
    })).toEqual(['src/a.ts', 'docs/plan.md']);

    expect(normalizeAgentTaskFiles({
      files: [
        '\\\\server\\share\\repo\\project\\src\\a.ts',
        '\\\\server\\share\\repo\\project\\packages\\x\\index.ts',
        '\\\\server\\other\\repo\\project\\src\\outside.ts',
      ],
      projectRoot: '\\\\server\\share\\repo\\project',
    })).toEqual(['src/a.ts', 'packages/x/index.ts']);
  });

  it('文档片段推导按标题优先', () => {
    const excerpt = deriveDocExcerptFromTextSync([
      '# Head',
      '## P2-1 合同',
      '修改 src/a.ts',
      '## P2-2 其他',
    ].join('\n'), {
      taskId: 'P2-1',
      label: '合同',
    });

    expect(excerpt.strategy).toBe('task-heading');
    expect(excerpt.excerpt).toContain('P2-1');
  });

  it('文档片段在窗口达到后会提前停止（sync）', () => {
    const longLine = '覆盖窗口'.repeat(2000);
    const excerpt = deriveDocExcerptFromTextSync([
      '前置',
      'TASK-100 命中 task 且标签命中',
      longLine,
      'never-should-appear-sync',
    ].join('\n'), {
      taskId: 'TASK-100',
      label: '标签命中',
      maxChars: 1000,
    });

    expect(excerpt.excerpt).not.toContain('never-should-appear-sync');
    expect(excerpt.strategy === 'task-id-window' || excerpt.strategy === 'task-heading').toBe(true);
  });

  it('文档片段在窗口达到后会提前停止（async）', async () => {
    const longLine = '覆盖窗口'.repeat(2000);
    const excerpt = await deriveDocExcerptFromText([
      '前置',
      'TASK-200 命中 task 且标签命中',
      longLine,
      'never-should-appear-async',
    ].join('\n'), {
      taskId: 'TASK-200',
      label: '标签命中',
      maxChars: 1000,
    });

    expect(excerpt.excerpt).not.toContain('never-should-appear-async');
    expect(excerpt.strategy === 'task-id-window' || excerpt.strategy === 'task-heading').toBe(true);
  });

  it('并发判定在冲突时串行', () => {
    expect(decideAgentTaskConcurrency([
      {
        taskId: 'T1',
        label: 'a',
        allowedFiles: ['src/a.ts'],
        forbiddenFiles: [],
        boundaryConfidence: 'high',
        executionMode: 'parallel-eligible',
      },
      {
        taskId: 'T2',
        label: 'b',
        allowedFiles: ['src/a.ts'],
        forbiddenFiles: [],
        boundaryConfidence: 'high',
        executionMode: 'parallel-eligible',
      },
    ]).mode).toBe('serial');
  });
});
