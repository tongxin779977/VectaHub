import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildAgentTaskContractSummaries,
  decideDocTaskBatchConcurrency,
  toRunContractSummary,
} from '../src/project/docTaskContract.js';

describe('doc task contract', () => {
  it('从共享文档内容为批量任务生成合同摘要', () => {
    const doc = [
      '# P2',
      '## T1 run-task 接入',
      '修改 `src/commands/run-task.ts`。',
      '补充 src/commands/run-task.test.ts。',
      '## T2 插件接入',
      '修改 packages/vectahub-vscode-extension/src/commands/runDocTasks.ts。',
    ].join('\n');

    const summaries = buildAgentTaskContractSummaries({
      tasks: [
        { id: 'T1', label: 'run-task 接入' },
        { id: 'T2', label: '插件接入' },
      ],
      docContent: doc,
      projectRoot: '/repo/project',
    });

    expect(summaries.get('T1')?.allowedFiles).toEqual([
      'src/commands/run-task.ts',
      'src/commands/run-task.test.ts',
    ]);
    expect(summaries.get('T1')?.validationCommands).toEqual([
      'npm test -- src/commands/run-task.test.ts --run',
      'npm run typecheck',
    ]);
    expect(summaries.get('T2')?.allowedFiles).toEqual([
      'packages/vectahub-vscode-extension/src/commands/runDocTasks.ts',
    ]);
  });

  it('未知边界或文件重叠时降级串行', () => {
    const unknown = buildAgentTaskContractSummaries({
      tasks: [{ id: 'T1', label: '没有路径' }],
      docContent: '只描述目标',
      projectRoot: '/repo/project',
    });
    expect(decideDocTaskBatchConcurrency({ contracts: unknown, requestedMaxConcurrent: 3 })).toMatchObject({
      mode: 'serial',
      reason: 'unknown-boundary',
      effectiveMaxConcurrent: 1,
    });

    const overlap = buildAgentTaskContractSummaries({
      tasks: [{ id: 'T1', label: 'A' }, { id: 'T2', label: 'B' }],
      docContent: [
        '## T1 A',
        '改 `src/a.ts`。',
        '## T2 B',
        '也改 `src/a.ts`。',
      ].join('\n'),
      projectRoot: '/repo/project',
    });
    expect(decideDocTaskBatchConcurrency({ contracts: overlap, requestedMaxConcurrent: 3 })).toMatchObject({
      mode: 'serial',
      reason: 'allowed-overlap',
      effectiveMaxConcurrent: 1,
    });
  });

  it('明确不重叠时允许按配置并发并保存计数摘要', () => {
    const summaries = buildAgentTaskContractSummaries({
      tasks: [{ id: 'T1', label: 'A' }, { id: 'T2', label: 'B' }],
      docContent: [
        '## T1 A',
        '改 `src/a.ts`。',
        '## T2 B',
        '改 `src/b.ts`。',
      ].join('\n'),
      projectRoot: '/repo/project',
    });

    expect(decideDocTaskBatchConcurrency({ contracts: summaries, requestedMaxConcurrent: 3 })).toMatchObject({
      mode: 'parallel',
      reason: 'non-overlap-medium-high',
      effectiveMaxConcurrent: 3,
    });
    expect(toRunContractSummary(summaries.get('T1'))).toEqual({
      boundaryConfidence: 'medium',
      allowedFileCount: 1,
      forbiddenFileCount: 6,
      validationCommandCount: 1,
      executionMode: 'parallel-eligible',
    });
  });

  it('插件侧合同预检优先匹配项目真实 type-check 脚本', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vectahub-doc-task-contract-'));
    try {
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
        name: 'tmp-project',
        scripts: {
          'type-check': 'tsc --noEmit',
        },
      }), 'utf8');

      const summaries = buildAgentTaskContractSummaries({
        tasks: [{ id: 'T1', label: 'run-task 接入' }],
        docContent: [
          '## T1 run-task 接入',
          '修改 `src/commands/run-task.ts`。',
        ].join('\n'),
        projectRoot,
      });

      expect(summaries.get('T1')?.validationCommands).toEqual(['npm run type-check']);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
