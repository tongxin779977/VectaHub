import { describe, it, expect } from 'vitest';
import { ProjectTask, ProjectTaskKind } from '../src/project/taskModel.js';

interface PipelineStep {
  kind: ProjectTaskKind;
  idPattern?: string;
  label: string;
}

interface PipelineSelection {
  included: ProjectTask[];
  skipped: string[];
}

const CHECK_PIPELINE_STEPS: PipelineStep[] = [
  { kind: 'typecheck', label: '类型检查' },
  { kind: 'lint', label: '代码检查' },
  { kind: 'test', label: '运行测试' },
  { kind: 'build', label: '构建项目' }
];

const DEV_PIPELINE_STEPS: PipelineStep[] = [
  { kind: 'check', idPattern: 'format:check', label: '格式检查' },
  { kind: 'typecheck', label: '类型检查' },
  { kind: 'lint', label: '代码检查' },
  { kind: 'test', label: '运行测试' },
  { kind: 'build', label: '构建项目' }
];

function findTaskForStep(step: PipelineStep, tasks: ProjectTask[]): ProjectTask | undefined {
  return tasks.find(t => {
    if (t.kind !== step.kind) return false;
    if (step.idPattern && !t.id.includes(step.idPattern)) return false;
    return true;
  });
}

function selectPipelineTasks(steps: PipelineStep[], availableTasks: ProjectTask[]): PipelineSelection {
  const included: ProjectTask[] = [];
  const skipped: string[] = [];

  for (const step of steps) {
    const task = findTaskForStep(step, availableTasks);
    if (task) {
      included.push(task);
    } else {
      skipped.push(step.label);
    }
  }

  return { included, skipped };
}

function makeTask(kind: string, id: string = `pkg:${kind}`): ProjectTask {
  return {
    id,
    kind: kind as ProjectTask['kind'],
    label: kind,
    source: 'package-json',
    available: true,
    command: { cli: 'npm', args: ['run', kind] }
  };
}

describe('检查链任务选取 (CHECK_PIPELINE_STEPS)', () => {
  it('全部 4 个任务存在时按 typecheck/lint/test/build 顺序', () => {
    const tasks = [
      makeTask('build'),
      makeTask('test'),
      makeTask('lint'),
      makeTask('typecheck')
    ];
    const { included, skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(included.map(t => t.kind)).toEqual(['typecheck', 'lint', 'test', 'build']);
    expect(skipped).toEqual([]);
  });

  it('只有 test 和 lint 时只包含这 2 个，skipped 包含 typecheck/build', () => {
    const tasks = [makeTask('test'), makeTask('lint')];
    const { included, skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(included.map(t => t.kind)).toEqual(['lint', 'test']);
    expect(skipped).toEqual(['类型检查', '构建项目']);
  });

  it('没有任何质量任务时 included 为空，skipped 全部', () => {
    const tasks: ProjectTask[] = [];
    const { included, skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(included).toEqual([]);
    expect(skipped).toEqual(['类型检查', '代码检查', '运行测试', '构建项目']);
  });

  it('顺序稳定性 — 多次生成结果一致', () => {
    const tasks = [makeTask('build'), makeTask('test'), makeTask('lint'), makeTask('typecheck')];
    const result1 = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    const result2 = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(result1.included.map(t => t.kind)).toEqual(result2.included.map(t => t.kind));
    expect(result1.skipped).toEqual(result2.skipped);
  });

  it('只缺少一个任务时正确跳过', () => {
    const tasks = [makeTask('typecheck'), makeTask('lint'), makeTask('build')];
    const { included, skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(included.map(t => t.kind)).toEqual(['typecheck', 'lint', 'build']);
    expect(skipped).toEqual(['运行测试']);
  });
});

describe('开发链任务选取 (DEV_PIPELINE_STEPS)', () => {
  it('包含 format:check 时排在最前', () => {
    const tasks = [
      makeTask('check', 'pkg:format:check'),
      makeTask('typecheck'),
      makeTask('lint'),
      makeTask('test'),
      makeTask('build')
    ];
    const { included, skipped } = selectPipelineTasks(DEV_PIPELINE_STEPS, tasks);
    expect(included.map(t => t.id)).toEqual([
      'pkg:format:check', 'pkg:typecheck', 'pkg:lint', 'pkg:test', 'pkg:build'
    ]);
    expect(skipped).toEqual([]);
  });

  it('install 不被自动纳入', () => {
    const tasks = [
      makeTask('install'),
      makeTask('check', 'pkg:format:check'),
      makeTask('typecheck'),
      makeTask('lint'),
      makeTask('test'),
      makeTask('build')
    ];
    const { included } = selectPipelineTasks(DEV_PIPELINE_STEPS, tasks);
    expect(included.some(t => t.kind === 'install')).toBe(false);
  });

  it('format（非 format:check）不被纳入', () => {
    const tasks = [
      makeTask('format'),
      makeTask('typecheck'),
      makeTask('lint')
    ];
    const { included, skipped } = selectPipelineTasks(DEV_PIPELINE_STEPS, tasks);
    expect(included.some(t => t.kind === 'format')).toBe(false);
    expect(skipped).toContain('格式检查');
  });

  it('只有 check 脚本但不是 format:check 时跳过格式检查', () => {
    const tasks = [
      makeTask('check', 'pkg:check'),
      makeTask('typecheck')
    ];
    const { included, skipped } = selectPipelineTasks(DEV_PIPELINE_STEPS, tasks);
    expect(included.some(t => t.id === 'pkg:check')).toBe(false);
    expect(skipped).toContain('格式检查');
  });

  it('format:check 存在但 typecheck 不存在时正确跳过', () => {
    const tasks = [
      makeTask('check', 'pkg:format:check'),
      makeTask('lint'),
      makeTask('test')
    ];
    const { included, skipped } = selectPipelineTasks(DEV_PIPELINE_STEPS, tasks);
    expect(included.map(t => t.id)).toEqual(['pkg:format:check', 'pkg:lint', 'pkg:test']);
    expect(skipped).toEqual(['类型检查', '构建项目']);
  });
});

describe('摘要内容', () => {
  it('skipped 数组包含正确的跳过任务名', () => {
    const tasks = [makeTask('test')];
    const { skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(skipped).toEqual(['类型检查', '代码检查', '构建项目']);
  });

  it('全部跳过时 skipped 包含所有步骤标签', () => {
    const { skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, []);
    expect(skipped).toEqual(['类型检查', '代码检查', '运行测试', '构建项目']);
  });

  it('全部存在时 skipped 为空', () => {
    const tasks = [
      makeTask('typecheck'),
      makeTask('lint'),
      makeTask('test'),
      makeTask('build')
    ];
    const { skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(skipped).toEqual([]);
  });
});

describe('步骤定义', () => {
  it('检查链固定优先级正确', () => {
    expect(CHECK_PIPELINE_STEPS.map(s => s.kind)).toEqual(['typecheck', 'lint', 'test', 'build']);
  });

  it('开发链固定优先级正确', () => {
    expect(DEV_PIPELINE_STEPS.map(s => s.kind)).toEqual(['check', 'typecheck', 'lint', 'test', 'build']);
  });

  it('开发链第一步有 idPattern 约束', () => {
    expect(DEV_PIPELINE_STEPS[0].idPattern).toBe('format:check');
  });

  it('检查链步骤没有 idPattern', () => {
    for (const step of CHECK_PIPELINE_STEPS) {
      expect(step.idPattern).toBeUndefined();
    }
  });
});

describe('空项目', () => {
  it('无任务时返回空 included 和全部 skipped', () => {
    const { included, skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, []);
    expect(included).toEqual([]);
    expect(skipped.length).toBe(CHECK_PIPELINE_STEPS.length);
  });

  it('只有非质量任务时返回空 included', () => {
    const tasks = [makeTask('dev'), makeTask('start')];
    const { included, skipped } = selectPipelineTasks(CHECK_PIPELINE_STEPS, tasks);
    expect(included).toEqual([]);
    expect(skipped.length).toBe(CHECK_PIPELINE_STEPS.length);
  });
});

describe('自定义步骤', () => {
  it('单步骤正确选取', () => {
    const steps: PipelineStep[] = [{ kind: 'test', label: '运行测试' }];
    const tasks = [makeTask('test'), makeTask('lint')];
    const { included, skipped } = selectPipelineTasks(steps, tasks);
    expect(included.length).toBe(1);
    expect(included[0].kind).toBe('test');
    expect(skipped).toEqual([]);
  });

  it('带 idPattern 的步骤正确匹配', () => {
    const steps: PipelineStep[] = [
      { kind: 'check', idPattern: 'validate', label: '验证' }
    ];
    const tasks = [
      makeTask('check', 'pkg:validate'),
      makeTask('check', 'pkg:format:check')
    ];
    const { included } = selectPipelineTasks(steps, tasks);
    expect(included.length).toBe(1);
    expect(included[0].id).toBe('pkg:validate');
  });
});
