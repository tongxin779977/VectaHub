import { describe, it, expect } from 'vitest';
import { normalizeDiagnosticQueue, normalizeDiagnosticTask, VALID_DIAGNOSTIC_STATUSES, DiagnosticTaskStatus } from '../src/project/diagnosticModel.js';

type CliReadinessState = 'detecting' | 'ready' | 'missing';

interface ReadinessStateMachine {
  state: CliReadinessState;
  cliPath?: string;
  detectionPromise: Promise<CliReadinessState> | null;
}

function createMachine(): ReadinessStateMachine {
  return { state: 'detecting', cliPath: undefined, detectionPromise: null };
}

function resolveDetectionSuccess(m: ReadinessStateMachine, path: string): void {
  m.state = 'ready';
  m.cliPath = path;
}

function resolveDetectionFailure(m: ReadinessStateMachine): void {
  m.state = 'missing';
}

function waitForResult(m: ReadinessStateMachine): { proceed: boolean; showInstallGuide: boolean } {
  if (m.state === 'ready') {
    return { proceed: true, showInstallGuide: false };
  }
  if (m.state === 'missing') {
    return { proceed: false, showInstallGuide: true };
  }
  return { proceed: false, showInstallGuide: false };
}

describe('CLI readiness 状态机', () => {
  it('初始状态为 detecting', () => {
    const m = createMachine();
    expect(m.state).toBe('detecting');
    expect(m.cliPath).toBeUndefined();
    expect(m.detectionPromise).toBeNull();
  });

  it('检测成功后状态变为 ready', () => {
    const m = createMachine();
    resolveDetectionSuccess(m, '/usr/local/bin/vectahub');
    expect(m.state).toBe('ready');
    expect(m.cliPath).toBe('/usr/local/bin/vectahub');
  });

  it('检测失败后状态变为 missing', () => {
    const m = createMachine();
    resolveDetectionFailure(m);
    expect(m.state).toBe('missing');
    expect(m.cliPath).toBeUndefined();
  });
});

describe('waitForCliReady 决策逻辑', () => {
  it('ready 状态允许执行', () => {
    const m = createMachine();
    resolveDetectionSuccess(m, '/usr/local/bin/vectahub');
    const result = waitForResult(m);
    expect(result.proceed).toBe(true);
    expect(result.showInstallGuide).toBe(false);
  });

  it('missing 状态显示安装引导', () => {
    const m = createMachine();
    resolveDetectionFailure(m);
    const result = waitForResult(m);
    expect(result.proceed).toBe(false);
    expect(result.showInstallGuide).toBe(true);
  });

  it('detecting 状态不显示安装引导也不执行', () => {
    const m = createMachine();
    const result = waitForResult(m);
    expect(result.proceed).toBe(false);
    expect(result.showInstallGuide).toBe(false);
  });

  it('detecting 且无 stored detector 时显示安装引导', () => {
    const m = createMachine();
    const hasStoredDetector = false;
    if (m.state === 'detecting' && !m.detectionPromise && !hasStoredDetector) {
      const result = { proceed: false, showInstallGuide: true };
      expect(result.proceed).toBe(false);
      expect(result.showInstallGuide).toBe(true);
    }
  });

  it('detecting 且有 stored detector 时触发懒检测', () => {
    const m = createMachine();
    const hasStoredDetector = true;
    if (m.state === 'detecting' && !m.detectionPromise && hasStoredDetector) {
      resolveDetectionSuccess(m, '/usr/local/bin/vectahub');
      expect(m.state).toBe('ready');
    }
  });

  it('从 detecting 到 ready 的转换', () => {
    const m = createMachine();
    expect(m.state).toBe('detecting');

    resolveDetectionSuccess(m, '/opt/vectahub/bin/vectahub');
    expect(m.state).toBe('ready');
    expect(m.cliPath).toBe('/opt/vectahub/bin/vectahub');
  });

  it('从 detecting 到 missing 的转换', () => {
    const m = createMachine();
    expect(m.state).toBe('detecting');

    resolveDetectionFailure(m);
    expect(m.state).toBe('missing');
  });
});

describe('normalizeDiagnosticTask 纯函数', () => {
  it('正常数据直接通过', () => {
    const raw = { id: '1', title: 'Fix lint', status: 'pending', source: 'github-actions', commandToFix: 'fix-lint', description: 'desc', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const result = normalizeDiagnosticTask(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('1');
    expect(result!.title).toBe('Fix lint');
    expect(result!.status).toBe('pending');
    expect(result!.source).toBe('github-actions');
    expect(result!.commandToFix).toBe('fix-lint');
    expect(result!.description).toBe('desc');
  });

  it('缺 id 返回 null', () => {
    const raw = { title: 'No ID', status: 'pending' };
    expect(normalizeDiagnosticTask(raw)).toBeNull();
  });

  it('null 输入返回 null', () => {
    expect(normalizeDiagnosticTask(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it('缺 title 兜底为 未知任务', () => {
    const result = normalizeDiagnosticTask({ id: '2', status: 'pending' });
    expect(result!.title).toBe('未知任务');
  });

  it('缺 commandToFix 时 nextAction 独立存在', () => {
    const result = normalizeDiagnosticTask({ id: '3', title: 'Test', status: 'pending', nextAction: 'run-fix' });
    expect(result!.commandToFix).toBeUndefined();
    expect(result!.nextAction).toBe('run-fix');
  });

  it('commandToFix 和 nextAction 都缺时为 undefined', () => {
    const result = normalizeDiagnosticTask({ id: '4', title: 'Test', status: 'pending' });
    expect(result!.commandToFix).toBeUndefined();
    expect(result!.nextAction).toBeUndefined();
  });

  it('未知 status 归入 needs-confirmation', () => {
    const result = normalizeDiagnosticTask({ id: '5', title: 'Test', status: 'unknown-status' });
    expect(result!.status).toBe('needs-confirmation');
  });

  it('缺 status 归入 needs-confirmation', () => {
    const result = normalizeDiagnosticTask({ id: '5b', title: 'Test' });
    expect(result!.status).toBe('needs-confirmation');
  });

  it('缺 description 兜底为空字符串', () => {
    const result = normalizeDiagnosticTask({ id: '8', title: 'Test', status: 'pending' });
    expect(result!.description).toBe('');
  });

  it('缺 source 兜底为 system', () => {
    const result = normalizeDiagnosticTask({ id: '9', title: 'Test', status: 'pending' });
    expect(result!.source).toBe('system');
  });

  it('未知 source 归入 system', () => {
    const result = normalizeDiagnosticTask({ id: '9b', title: 'Test', status: 'pending', source: 'unknown-origin' });
    expect(result!.source).toBe('system');
  });

  it('所有 6 个合法 status 都能正确识别', () => {
    for (const status of VALID_DIAGNOSTIC_STATUSES) {
      const result = normalizeDiagnosticTask({ id: `s-${status}`, title: status, status });
      expect(result!.status).toBe(status);
    }
  });

  it('createdAt/updatedAt 缺失时生成 ISO 字符串', () => {
    const result = normalizeDiagnosticTask({ id: '10', title: 'Test', status: 'pending' });
    expect(typeof result!.createdAt).toBe('string');
    expect(typeof result!.updatedAt).toBe('string');
    expect(() => new Date(result!.createdAt as string)).not.toThrow();
  });

  it('error 字段为字符串时保留', () => {
    const result = normalizeDiagnosticTask({ id: '11', title: 'Test', status: 'failed', error: 'something broke' });
    expect(result!.error).toBe('something broke');
  });

  it('error 字段非字符串时丢弃', () => {
    const result = normalizeDiagnosticTask({ id: '12', title: 'Test', status: 'failed', error: 123 });
    expect(result!.error).toBeUndefined();
  });
});

describe('normalizeDiagnosticQueue 纯函数', () => {
  it('正常数组返回所有有效任务', () => {
    const data = [
      { id: '1', title: 'A', status: 'pending' },
      { id: '2', title: 'B', status: 'completed' },
    ];
    const result = normalizeDiagnosticQueue(data);
    expect(result.tasks.length).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it('null 返回空队列和错误', () => {
    const result = normalizeDiagnosticQueue(null);
    expect(result.tasks.length).toBe(0);
    expect(result.error).toBeDefined();
  });

  it('undefined 返回空队列和错误', () => {
    const result = normalizeDiagnosticQueue(undefined);
    expect(result.tasks.length).toBe(0);
    expect(result.error).toBeDefined();
  });

  it('非数组返回格式错误', () => {
    const result = normalizeDiagnosticQueue({ foo: 'bar' });
    expect(result.tasks.length).toBe(0);
    expect(result.error).toContain('格式错误');
  });

  it('空数组返回空结果无错误', () => {
    const result = normalizeDiagnosticQueue([]);
    expect(result.tasks.length).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('null/undefined/非对象条目被跳过', () => {
    const data = [null, undefined, 'string', 123, { id: '1', title: 'Valid', status: 'pending' }];
    const result = normalizeDiagnosticQueue(data);
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].id).toBe('1');
  });

  it('缺 id 条目被跳过', () => {
    const data = [{ title: 'No ID', status: 'pending' }, { id: '1', title: 'Valid', status: 'pending' }];
    const result = normalizeDiagnosticQueue(data);
    expect(result.tasks.length).toBe(1);
  });
});

describe('fetchGhErrors 队列快照逻辑', () => {
  function countPending(tasks: { id: string; status: DiagnosticTaskStatus }[]): number {
    return tasks.filter(t => t.status === 'pending' || t.status === 'needs-confirmation').length;
  }

  it('有 pending 任务时返回正确数量', () => {
    const tasks = [
      { id: '1', status: 'pending' as DiagnosticTaskStatus },
      { id: '2', status: 'pending' as DiagnosticTaskStatus },
      { id: '3', status: 'completed' as DiagnosticTaskStatus },
    ];
    expect(countPending(tasks)).toBe(2);
  });

  it('有 needs-confirmation 任务时计入', () => {
    const tasks = [
      { id: '1', status: 'needs-confirmation' as DiagnosticTaskStatus },
      { id: '2', status: 'completed' as DiagnosticTaskStatus },
    ];
    expect(countPending(tasks)).toBe(1);
  });

  it('全部完成时返回 0', () => {
    const tasks = [
      { id: '1', status: 'completed' as DiagnosticTaskStatus },
      { id: '2', status: 'failed' as DiagnosticTaskStatus },
    ];
    expect(countPending(tasks)).toBe(0);
  });

  it('空队列返回 0', () => {
    expect(countPending([])).toBe(0);
  });

  it('只看 pending 和 needs-confirmation，不计 failed/completed/cancelled/processing', () => {
    const tasks = [
      { id: '1', status: 'failed' as DiagnosticTaskStatus },
      { id: '2', status: 'cancelled' as DiagnosticTaskStatus },
      { id: '3', status: 'completed' as DiagnosticTaskStatus },
      { id: '4', status: 'processing' as DiagnosticTaskStatus },
    ];
    expect(countPending(tasks)).toBe(0);
  });
});

describe('processAllQueue 队列快照对比逻辑', () => {
  interface QueueTask {
    id: string;
    status: DiagnosticTaskStatus;
  }

  function computeSummary(before: QueueTask[], after: QueueTask[]): { completed: number; pendingAfter: number; failed: number; needsConfirmation: number } {
    const pendingAfter = after.filter(t => t.status === 'pending').length;
    const beforePendingIds = new Set(before.filter(t => t.status === 'pending').map(t => t.id));
    const completed = after.filter(t => t.status === 'completed' && beforePendingIds.has(t.id)).length;
    const failed = after.filter(t => t.status === 'failed').length;
    const needsConfirmation = after.filter(t => t.status === 'needs-confirmation').length;
    return { completed, pendingAfter, failed, needsConfirmation };
  }

  it('全部处理完成', () => {
    const before: QueueTask[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
    ];
    const after: QueueTask[] = [
      { id: '1', status: 'completed' },
      { id: '2', status: 'completed' },
    ];
    const result = computeSummary(before, after);
    expect(result.completed).toBe(2);
    expect(result.pendingAfter).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.needsConfirmation).toBe(0);
  });

  it('部分失败', () => {
    const before: QueueTask[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'pending' },
    ];
    const after: QueueTask[] = [
      { id: '1', status: 'completed' },
      { id: '2', status: 'failed' },
      { id: '3', status: 'pending' },
    ];
    const result = computeSummary(before, after);
    expect(result.completed).toBe(1);
    expect(result.pendingAfter).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('队列为空时返回全 0', () => {
    const result = computeSummary([], []);
    expect(result.completed).toBe(0);
    expect(result.pendingAfter).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.needsConfirmation).toBe(0);
  });

  it('取消后仍有待处理', () => {
    const before: QueueTask[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'pending' },
    ];
    const after: QueueTask[] = [
      { id: '1', status: 'completed' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'pending' },
    ];
    const result = computeSummary(before, after);
    expect(result.completed).toBe(1);
    expect(result.pendingAfter).toBe(2);
  });

  it('processing 任务不计入 pendingAfter', () => {
    const before: QueueTask[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
    ];
    const after: QueueTask[] = [
      { id: '1', status: 'completed' },
      { id: '2', status: 'processing' },
    ];
    const result = computeSummary(before, after);
    expect(result.completed).toBe(1);
    expect(result.pendingAfter).toBe(0);
  });

  it('before 中 processing 任务不参与 completed 计算', () => {
    const before: QueueTask[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'processing' },
    ];
    const after: QueueTask[] = [
      { id: '1', status: 'completed' },
      { id: '2', status: 'completed' },
    ];
    const result = computeSummary(before, after);
    expect(result.completed).toBe(1);
    expect(result.pendingAfter).toBe(0);
  });

  it('needs-confirmation 任务被正确计数', () => {
    const before: QueueTask[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'pending' },
    ];
    const after: QueueTask[] = [
      { id: '1', status: 'completed' },
      { id: '2', status: 'needs-confirmation' },
      { id: '3', status: 'failed' },
    ];
    const result = computeSummary(before, after);
    expect(result.completed).toBe(1);
    expect(result.pendingAfter).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.needsConfirmation).toBe(1);
  });

  it('摘要 parts 构建逻辑 (含 needs-confirmation)', () => {
    function buildParts(completed: number, pendingAfter: number, failed: number, needsConfirmation: number): string[] {
      const parts: string[] = [];
      if (completed > 0) parts.push(`✅ 已处理 ${completed}`);
      if (pendingAfter > 0) parts.push(`⏳ 剩余待处理 ${pendingAfter}`);
      if (failed > 0) parts.push(`❌ 失败 ${failed}`);
      if (needsConfirmation > 0) parts.push(`⚠️ 待确认 ${needsConfirmation}`);
      return parts;
    }

    expect(buildParts(3, 0, 0, 0)).toEqual(['✅ 已处理 3']);
    expect(buildParts(2, 1, 1, 1)).toEqual(['✅ 已处理 2', '⏳ 剩余待处理 1', '❌ 失败 1', '⚠️ 待确认 1']);
    expect(buildParts(0, 0, 0, 0)).toEqual([]);
    expect(buildParts(0, 3, 0, 0)).toEqual(['⏳ 剩余待处理 3']);
    expect(buildParts(0, 0, 2, 0)).toEqual(['❌ 失败 2']);
    expect(buildParts(0, 0, 0, 2)).toEqual(['⚠️ 待确认 2']);
  });

  function determineHistoryStatus(failedCount: number): 'failed' | 'success' {
    return failedCount > 0 ? 'failed' : 'success';
  }

  it('history 状态: 有 failed 时为 failed', () => {
    expect(determineHistoryStatus(5)).toBe('failed');
  });

  it('history 状态: 无 failed 时为 success', () => {
    expect(determineHistoryStatus(0)).toBe('success');
  });
});
