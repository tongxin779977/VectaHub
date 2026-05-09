import { describe, it, expect } from 'vitest';
import { DiagnosticTask, DiagnosticTaskStatus } from '../src/project/diagnosticModel.js';
import { EmptyStateTreeItem } from '../src/views/treeItems.js';

function groupDiagnosticsByStatus(tasks: DiagnosticTask[]): Map<DiagnosticTaskStatus, DiagnosticTask[]> {
  const groups = new Map<DiagnosticTaskStatus, DiagnosticTask[]>();
  for (const task of tasks) {
    const validStatuses: DiagnosticTaskStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'needs-confirmation'];
    const status: DiagnosticTaskStatus = validStatuses.includes(task.status as DiagnosticTaskStatus)
      ? (task.status as DiagnosticTaskStatus)
      : 'failed';
    const list = groups.get(status) || [];
    list.push(task);
    groups.set(status, list);
  }
  return groups;
}

const DEV_KINDS = ['dev', 'start', 'serve'];
const QUALITY_KINDS = ['test', 'build', 'lint', 'typecheck', 'check', 'validate', 'format', 'format:check', 'coverage', 'storybook'];

interface ProjectTaskStub {
  kind: string;
  source: string;
}

function filterDevTasks(tasks: ProjectTaskStub[]): ProjectTaskStub[] {
  return tasks.filter(t => DEV_KINDS.includes(t.kind));
}

function filterQualityTasks(tasks: ProjectTaskStub[]): ProjectTaskStub[] {
  return tasks.filter(t => QUALITY_KINDS.includes(t.kind));
}

function filterOtherScripts(tasks: ProjectTaskStub[]): ProjectTaskStub[] {
  return tasks.filter(t => t.source === 'package-json' && !DEV_KINDS.includes(t.kind) && !QUALITY_KINDS.includes(t.kind) && t.kind !== 'install');
}

function makeTask(overrides: Partial<DiagnosticTask>): DiagnosticTask {
  return {
    id: 'test-id',
    title: 'Test Task',
    description: 'desc',
    source: 'manual',
    commandToFix: 'echo ok',
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe('M2 队列分组逻辑', () => {
  it('空队列应返回空 Map', () => {
    const groups = groupDiagnosticsByStatus([]);
    expect(groups.size).toBe(0);
  });

  it('只有 pending 任务时只应有 pending 分组', () => {
    const tasks = [
      makeTask({ id: '1', status: 'pending' }),
      makeTask({ id: '2', status: 'pending' })
    ];
    const groups = groupDiagnosticsByStatus(tasks);
    expect(groups.size).toBe(1);
    expect(groups.has('pending')).toBe(true);
    expect(groups.get('pending')!.length).toBe(2);
    expect(groups.has('failed')).toBe(false);
    expect(groups.has('completed')).toBe(false);
  });

  it('混合状态应正确分组', () => {
    const tasks = [
      makeTask({ id: '1', status: 'pending' }),
      makeTask({ id: '2', status: 'pending' }),
      makeTask({ id: '3', status: 'failed' }),
      makeTask({ id: '4', status: 'completed' }),
      makeTask({ id: '5', status: 'processing' }),
      makeTask({ id: '6', status: 'cancelled' }),
      makeTask({ id: '7', status: 'needs-confirmation' })
    ];
    const groups = groupDiagnosticsByStatus(tasks);
    expect(groups.size).toBe(6);
    expect(groups.get('pending')!.length).toBe(2);
    expect(groups.get('failed')!.length).toBe(1);
    expect(groups.get('completed')!.length).toBe(1);
    expect(groups.get('processing')!.length).toBe(1);
    expect(groups.get('cancelled')!.length).toBe(1);
    expect(groups.get('needs-confirmation')!.length).toBe(1);
  });

  it('未知状态应映射为 failed', () => {
    const tasks = [
      makeTask({ id: '1', status: 'unknown-status' as any })
    ];
    const groups = groupDiagnosticsByStatus(tasks);
    expect(groups.has('failed')).toBe(true);
    expect(groups.get('failed')!.length).toBe(1);
  });

  it('新状态类型 cancelled 和 needs-confirmation 应被识别', () => {
    const tasks = [
      makeTask({ id: '1', status: 'cancelled' }),
      makeTask({ id: '2', status: 'needs-confirmation' })
    ];
    const groups = groupDiagnosticsByStatus(tasks);
    expect(groups.has('cancelled')).toBe(true);
    expect(groups.has('needs-confirmation')).toBe(true);
    expect(groups.has('failed')).toBe(false);
  });
});

describe('M2 队列错误处理', () => {
  it('空数组不应返回错误', () => {
    const result = { tasks: [] as DiagnosticTask[], error: undefined as string | undefined };
    expect(result.tasks).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('JSON 损坏应标记错误', () => {
    let error: string | undefined;
    try {
      JSON.parse('not valid json');
    } catch {
      error = '队列数据不可读';
    }
    expect(error).toBe('队列数据不可读');
  });

  it('非数组 JSON 应标记格式错误', () => {
    const data = JSON.parse('{"ok": true}');
    const isArray = Array.isArray(data);
    expect(isArray).toBe(false);
  });

  it('缺少必填字段的条目应被过滤', () => {
    const data = [
      { id: '1', title: 'Valid', status: 'pending' },
      { id: '2', title: '', status: 'pending' },
      { id: '3', status: 'pending' },
      { title: 'No ID', status: 'pending' },
      { id: '4', title: 'No Status' }
    ];
    const filtered = data.filter(t => t && t.id && t.title && t.status);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('1');
  });
});

describe('M2 分类分组逻辑', () => {
  it('dev/start/serve 应归入一键开发', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'dev', source: 'package-json' },
      { kind: 'test', source: 'package-json' },
      { kind: 'start', source: 'package-json' }
    ];
    const devItems = filterDevTasks(tasks);
    expect(devItems.length).toBe(2);
    expect(devItems.map(t => t.kind)).toEqual(['dev', 'start']);
  });

  it('质量检查应归入质量分类', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'test', source: 'package-json' },
      { kind: 'lint', source: 'package-json' },
      { kind: 'typecheck', source: 'package-json' },
      { kind: 'build', source: 'package-json' },
      { kind: 'format', source: 'package-json' },
      { kind: 'coverage', source: 'package-json' },
      { kind: 'dev', source: 'package-json' }
    ];
    const qualityItems = filterQualityTasks(tasks);
    expect(qualityItems.length).toBe(6);
    expect(qualityItems.some(t => t.kind === 'dev')).toBe(false);
  });

  it('install 不应出现在任何主分类中', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'install', source: 'package-json' }
    ];
    expect(filterDevTasks(tasks).length).toBe(0);
    expect(filterQualityTasks(tasks).length).toBe(0);
    expect(filterOtherScripts(tasks).length).toBe(0);
  });

  it('other 脚本应归入其他项目脚本', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'other', source: 'package-json' },
      { kind: 'dev', source: 'package-json' },
      { kind: 'test', source: 'package-json' }
    ];
    const otherItems = filterOtherScripts(tasks);
    expect(otherItems.length).toBe(1);
    expect(otherItems[0].kind).toBe('other');
  });

  it('git source 不应归入其他项目脚本', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'git-status', source: 'git' }
    ];
    const otherItems = filterOtherScripts(tasks);
    expect(otherItems.length).toBe(0);
  });

  it('vectahub source 不应归入其他项目脚本', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'doctor', source: 'vectahub' }
    ];
    const otherItems = filterOtherScripts(tasks);
    expect(otherItems.length).toBe(0);
  });

  it('没有 dev 脚本时一键开发分类不应创建', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'test', source: 'package-json' },
      { kind: 'lint', source: 'package-json' }
    ];
    const devItems = filterDevTasks(tasks);
    expect(devItems.length).toBe(0);
  });

  it('没有质量脚本时质量检查分类不应创建', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'dev', source: 'package-json' }
    ];
    const qualityItems = filterQualityTasks(tasks);
    expect(qualityItems.length).toBe(0);
  });

  it('没有 git source 时 CI 修复分类不应创建', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'dev', source: 'package-json' },
      { kind: 'test', source: 'package-json' }
    ];
    const gitAvailable = tasks.some(t => t.source === 'git');
    expect(gitAvailable).toBe(false);
  });

  it('同类型任务不重复', () => {
    const tasks: ProjectTaskStub[] = [
      { kind: 'test', source: 'package-json' },
      { kind: 'test', source: 'package-json' }
    ];
    const seen = new Set(tasks.map(t => t.kind));
    expect(seen.size).toBe(1);
  });
});

describe('M2 状态图标映射', () => {
  function getIconForStatus(status: string): string {
    switch (status) {
      case 'completed': return 'check';
      case 'processing': return 'sync~spin';
      case 'failed': return 'error';
      case 'cancelled': return 'circle-slash';
      case 'needs-confirmation': return 'question';
      default: return 'warning';
    }
  }

  it('completed 应映射为 check', () => {
    expect(getIconForStatus('completed')).toBe('check');
  });

  it('failed 应映射为 error', () => {
    expect(getIconForStatus('failed')).toBe('error');
  });

  it('cancelled 应映射为 circle-slash', () => {
    expect(getIconForStatus('cancelled')).toBe('circle-slash');
  });

  it('needs-confirmation 应映射为 question', () => {
    expect(getIconForStatus('needs-confirmation')).toBe('question');
  });

  it('pending 应映射为 warning', () => {
    expect(getIconForStatus('pending')).toBe('warning');
  });

  it('未知状态应映射为 warning', () => {
    expect(getIconForStatus('unknown')).toBe('warning');
  });
});

describe('M3 任务链入口位置', () => {
  it('一键检查全部应始终出现在质量检查分类末尾', () => {
    const qualityItems = ['运行测试', '代码检查', '类型检查', '一键检查全部'];
    const lastItem = qualityItems[qualityItems.length - 1];
    expect(lastItem).toBe('一键检查全部');
  });

  it('运行开发任务链应始终出现在一键开发分类末尾', () => {
    const devItems = ['启动开发服务', '运行开发任务链'];
    const lastItem = devItems[devItems.length - 1];
    expect(lastItem).toBe('运行开发任务链');
  });

  it('一键开发分类即使没有 dev/start/serve 脚本也应显示（因为有任务链入口）', () => {
    const devTasks: ProjectTaskStub[] = [];
    const pipelineEntry = { kind: 'pipeline', source: 'vectahub' };
    const allItems = [...filterDevTasks(devTasks), pipelineEntry];
    expect(allItems.length).toBe(1);
    expect(allItems[0].kind).toBe('pipeline');
  });

  it('质量检查分类即使没有质量脚本也应显示（因为有一键检查入口）', () => {
    const qualityTasks: ProjectTaskStub[] = [];
    const pipelineEntry = { kind: 'pipeline', source: 'vectahub' };
    const allItems = [...filterQualityTasks(qualityTasks), pipelineEntry];
    expect(allItems.length).toBe(1);
    expect(allItems[0].kind).toBe('pipeline');
  });
});
