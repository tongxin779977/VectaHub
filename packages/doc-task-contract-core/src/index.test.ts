import { describe, expect, it } from 'vitest';
import {
  buildGlobalConfigDigest,
  computeInstructionHash,
  decideAgentTaskConcurrency,
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
