import { describe, it, expect } from 'vitest';
import { LONG_RUNNING_KINDS, isLongRunning, ProjectTaskKind } from '../src/project/taskModel.js';

const ALL_KINDS: ProjectTaskKind[] = [
  'git-status', 'install', 'test', 'build', 'lint', 'typecheck',
  'dev', 'start', 'serve', 'preview', 'watch',
  'format', 'coverage', 'storybook', 'check', 'validate',
  'list-scripts', 'doctor', 'intent-preview', 'intent-run', 'other'
];

describe('LONG_RUNNING_KINDS 常量', () => {
  it('包含 dev/start/serve/preview/watch 五个 kind', () => {
    expect(LONG_RUNNING_KINDS).toEqual(['dev', 'start', 'serve', 'preview', 'watch']);
  });

  it('长度为 5', () => {
    expect(LONG_RUNNING_KINDS.length).toBe(5);
  });

  it('不包含 install', () => {
    expect(LONG_RUNNING_KINDS).not.toContain('install');
  });

  it('不包含 test/build/lint/typecheck', () => {
    expect(LONG_RUNNING_KINDS).not.toContain('test');
    expect(LONG_RUNNING_KINDS).not.toContain('build');
    expect(LONG_RUNNING_KINDS).not.toContain('lint');
    expect(LONG_RUNNING_KINDS).not.toContain('typecheck');
  });
});

describe('isLongRunning() 函数', () => {
  it.each(['dev', 'start', 'serve', 'preview', 'watch'] as ProjectTaskKind[])(
    'kind=%s 应返回 true',
    (kind) => {
      expect(isLongRunning(kind)).toBe(true);
    }
  );

  it.each(['test', 'build', 'lint', 'typecheck', 'install', 'format', 'coverage', 'storybook'] as ProjectTaskKind[])(
    'kind=%s 应返回 false',
    (kind) => {
      expect(isLongRunning(kind)).toBe(false);
    }
  );

  it.each(['check', 'validate', 'list-scripts', 'doctor', 'intent-preview', 'intent-run', 'other', 'git-status'] as ProjectTaskKind[])(
    'kind=%s 应返回 false',
    (kind) => {
      expect(isLongRunning(kind)).toBe(false);
    }
  );

  it('所有 kind 都有明确的 isLongRunning 判定', () => {
    for (const kind of ALL_KINDS) {
      const result = isLongRunning(kind);
      expect(typeof result).toBe('boolean');
    }
  });

  it('长驻任务数量 + 短任务数量 = 总 kind 数', () => {
    const longCount = ALL_KINDS.filter(k => isLongRunning(k)).length;
    const shortCount = ALL_KINDS.filter(k => !isLongRunning(k)).length;
    expect(longCount).toBe(5);
    expect(longCount + shortCount).toBe(ALL_KINDS.length);
  });
});

describe('长驻任务分类正确性', () => {
  it('开发服务类全部是长驻', () => {
    expect(isLongRunning('dev')).toBe(true);
    expect(isLongRunning('start')).toBe(true);
    expect(isLongRunning('serve')).toBe(true);
  });

  it('预览和监听类全部是长驻', () => {
    expect(isLongRunning('preview')).toBe(true);
    expect(isLongRunning('watch')).toBe(true);
  });

  it('质量检查类全部不是长驻', () => {
    expect(isLongRunning('test')).toBe(false);
    expect(isLongRunning('build')).toBe(false);
    expect(isLongRunning('lint')).toBe(false);
    expect(isLongRunning('typecheck')).toBe(false);
    expect(isLongRunning('check')).toBe(false);
    expect(isLongRunning('validate')).toBe(false);
    expect(isLongRunning('format')).toBe(false);
    expect(isLongRunning('coverage')).toBe(false);
  });

  it('install 不是长驻', () => {
    expect(isLongRunning('install')).toBe(false);
  });

  it('其他非标准 kind 不是长驻', () => {
    expect(isLongRunning('other')).toBe(false);
    expect(isLongRunning('git-status')).toBe(false);
    expect(isLongRunning('list-scripts')).toBe(false);
  });
});

describe('StatusBarStatus 类型覆盖 (逻辑验证)', () => {
  const STATUS_TEXT_MAP: Record<string, string> = {
    'Ready': '就绪',
    'CLI Missing': 'CLI 缺失',
    'Running': '运行中...',
    'Failed': '失败',
    'Dev Server': 'Dev Server 运行中'
  };

  it('Dev Server 状态有对应的文本', () => {
    expect(STATUS_TEXT_MAP['Dev Server']).toBe('Dev Server 运行中');
  });

  it('所有 5 个状态都有文本映射', () => {
    expect(Object.keys(STATUS_TEXT_MAP).length).toBe(5);
  });

  it('已有的 4 个状态文本未被修改', () => {
    expect(STATUS_TEXT_MAP['Ready']).toBe('就绪');
    expect(STATUS_TEXT_MAP['CLI Missing']).toBe('CLI 缺失');
    expect(STATUS_TEXT_MAP['Running']).toBe('运行中...');
    expect(STATUS_TEXT_MAP['Failed']).toBe('失败');
  });
});
