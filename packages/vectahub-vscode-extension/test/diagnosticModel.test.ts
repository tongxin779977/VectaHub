import { describe, it, expect } from 'vitest';
import {
  DiagnosticTask,
  VALID_DIAGNOSTIC_STATUSES,
  QueueSummary,
  normalizeDiagnosticTask,
  normalizeDiagnosticQueue,
  getExecutableAction
} from '../src/project/diagnosticModel.js';

describe('DiagnosticTask 共享 schema', () => {
  describe('DiagnosticTaskStatus', () => {
    it('应包含所有标准状态', () => {
      expect(VALID_DIAGNOSTIC_STATUSES).toContain('pending');
      expect(VALID_DIAGNOSTIC_STATUSES).toContain('processing');
      expect(VALID_DIAGNOSTIC_STATUSES).toContain('completed');
      expect(VALID_DIAGNOSTIC_STATUSES).toContain('failed');
      expect(VALID_DIAGNOSTIC_STATUSES).toContain('cancelled');
      expect(VALID_DIAGNOSTIC_STATUSES).toContain('needs-confirmation');
    });

    it('应有 6 个标准状态', () => {
      expect(VALID_DIAGNOSTIC_STATUSES).toHaveLength(6);
    });
  });

  describe('DiagnosticTask 接口', () => {
    it('commandToFix 应为可选字段', () => {
      const task: DiagnosticTask = {
        id: 'test-1',
        title: 'Test',
        description: 'desc',
        source: 'manual',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      expect(task.commandToFix).toBeUndefined();
    });

    it('nextAction 应为可选字段', () => {
      const task: DiagnosticTask = {
        id: 'test-1',
        title: 'Test',
        description: 'desc',
        source: 'manual',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      expect(task.nextAction).toBeUndefined();
    });

    it('应支持同时有 commandToFix 和 nextAction', () => {
      const task: DiagnosticTask = {
        id: 'test-1',
        title: 'Test',
        description: 'desc',
        source: 'manual',
        commandToFix: 'npm test',
        nextAction: '运行测试',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      expect(task.commandToFix).toBe('npm test');
      expect(task.nextAction).toBe('运行测试');
    });
  });

  describe('QueueSummary 接口', () => {
    it('所有字段应为可选', () => {
      const summary: QueueSummary = {};
      expect(summary.fetchedCount).toBeUndefined();
      expect(summary.addedCount).toBeUndefined();
      expect(summary.duplicateCount).toBeUndefined();
      expect(summary.pendingCount).toBeUndefined();
      expect(summary.processedCount).toBeUndefined();
      expect(summary.failedCount).toBeUndefined();
      expect(summary.remainingCount).toBeUndefined();
      expect(summary.needsConfirmationCount).toBeUndefined();
    });

    it('应支持部分字段', () => {
      const summary: QueueSummary = {
        fetchedCount: 10,
        addedCount: 3,
        pendingCount: 3
      };
      expect(summary.fetchedCount).toBe(10);
      expect(summary.addedCount).toBe(3);
      expect(summary.pendingCount).toBe(3);
      expect(summary.processedCount).toBeUndefined();
    });
  });
});

describe('normalizeDiagnosticTask', () => {
  it('应返回 null 对于无效输入', () => {
    expect(normalizeDiagnosticTask(null as any)).toBeNull();
    expect(normalizeDiagnosticTask(undefined as any)).toBeNull();
    expect(normalizeDiagnosticTask({} as any)).toBeNull();
    expect(normalizeDiagnosticTask({ id: '' })).toBeNull();
  });

  it('应规范化有效任务', () => {
    const raw = {
      id: 'test-1',
      title: 'Test Task',
      description: 'A test task',
      source: 'github-actions',
      commandToFix: 'npm test',
      status: 'pending',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z'
    };

    const task = normalizeDiagnosticTask(raw);
    expect(task).not.toBeNull();
    expect(task!.id).toBe('test-1');
    expect(task!.title).toBe('Test Task');
    expect(task!.source).toBe('github-actions');
    expect(task!.commandToFix).toBe('npm test');
    expect(task!.status).toBe('pending');
  });

  it('应处理缺失字段', () => {
    const raw = { id: 'test-1' };
    const task = normalizeDiagnosticTask(raw);
    expect(task).not.toBeNull();
    expect(task!.title).toBe('未知任务');
    expect(task!.description).toBe('');
    expect(task!.source).toBe('system');
    expect(task!.status).toBe('needs-confirmation');
  });

  it('未知状态应映射为 needs-confirmation', () => {
    const raw = { id: 'test-1', status: 'unknown-status' };
    const task = normalizeDiagnosticTask(raw);
    expect(task!.status).toBe('needs-confirmation');
  });

  it('未知 source 应映射为 system', () => {
    const raw = { id: 'test-1', source: 'unknown-source' };
    const task = normalizeDiagnosticTask(raw);
    expect(task!.source).toBe('system');
  });

  it('应保留 commandToFix 为可选', () => {
    const raw = { id: 'test-1', title: 'Test' };
    const task = normalizeDiagnosticTask(raw);
    expect(task!.commandToFix).toBeUndefined();
  });

  it('应保留 nextAction 为可选', () => {
    const raw = { id: 'test-1', title: 'Test', nextAction: '运行测试' };
    const task = normalizeDiagnosticTask(raw);
    expect(task!.nextAction).toBe('运行测试');
  });

  it('应同时支持 commandToFix 和 nextAction', () => {
    const raw = {
      id: 'test-1',
      title: 'Test',
      commandToFix: 'npm test',
      nextAction: '运行测试'
    };
    const task = normalizeDiagnosticTask(raw);
    expect(task!.commandToFix).toBe('npm test');
    expect(task!.nextAction).toBe('运行测试');
  });
});

describe('normalizeDiagnosticQueue', () => {
  it('应返回空队列对于无效输入', () => {
    const result = normalizeDiagnosticQueue(null);
    expect(result.tasks).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('应返回错误对于非数组输入', () => {
    const result = normalizeDiagnosticQueue({ ok: true });
    expect(result.tasks).toEqual([]);
    expect(result.error).toContain('格式错误');
  });

  it('应规范化有效队列', () => {
    const data = [
      { id: '1', title: 'Task 1', status: 'pending' },
      { id: '2', title: 'Task 2', status: 'completed' }
    ];
    const result = normalizeDiagnosticQueue(data);
    expect(result.tasks).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });

  it('应过滤无效任务', () => {
    const data = [
      { id: '1', title: 'Valid', status: 'pending' },
      { id: '', title: 'Invalid', status: 'pending' },
      { title: 'No ID', status: 'pending' }
    ];
    const result = normalizeDiagnosticQueue(data);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('1');
  });
});

describe('getExecutableAction', () => {
  it('应优先返回 commandToFix', () => {
    const task: DiagnosticTask = {
      id: '1',
      title: 'Test',
      description: '',
      source: 'manual',
      commandToFix: 'npm test',
      nextAction: '运行测试',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    expect(getExecutableAction(task)).toBe('npm test');
  });

  it('当 commandToFix 为空时应返回 nextAction', () => {
    const task: DiagnosticTask = {
      id: '1',
      title: 'Test',
      description: '',
      source: 'manual',
      commandToFix: '',
      nextAction: '运行测试',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    expect(getExecutableAction(task)).toBe('运行测试');
  });

  it('当 commandToFix 为 undefined 时应返回 nextAction', () => {
    const task: DiagnosticTask = {
      id: '1',
      title: 'Test',
      description: '',
      source: 'manual',
      nextAction: '运行测试',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    expect(getExecutableAction(task)).toBe('运行测试');
  });

  it('当两者都为空时应返回 undefined', () => {
    const task: DiagnosticTask = {
      id: '1',
      title: 'Test',
      description: '',
      source: 'manual',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    expect(getExecutableAction(task)).toBeUndefined();
  });
});
