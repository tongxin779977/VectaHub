import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowTraceAuditAdapter } from './trace-audit-adapter.js';
import type { AlertEvent, TraceMetrics, TraceQueryResult } from '../infrastructure/trace-audit/index.js';
import type { Workflow, Step, ExecutionRecord } from '../types/index.js';

const mockTraceSystem = {
  createTrace: vi.fn().mockResolvedValue({ traceId: 'test-trace', rootSpanId: 'root-span' }),
  createSpan: vi.fn().mockResolvedValue({ spanId: 'step-span' }),
  completeSpan: vi.fn().mockResolvedValue(undefined),
  refreshIndex: vi.fn(),
  getTrace: vi.fn(),
  query: vi.fn(),
  getMetrics: vi.fn(),
  getAlerts: vi.fn(),
  getSystemStats: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../infrastructure/trace-audit/index.js', () => ({
  createTraceAuditSystemWithDeps: vi.fn(() => mockTraceSystem),
}));

const mockDeps = {
  environment: { getPath: vi.fn().mockReturnValue('/tmp/test-logs') } as any,
  logger: { getLogger: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) } as any,
};

describe('WorkflowTraceAuditAdapter', () => {
  let adapter: WorkflowTraceAuditAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTraceSystem.createTrace.mockResolvedValue({ traceId: 'test-trace', rootSpanId: 'root-span' });
    mockTraceSystem.createSpan.mockResolvedValue({ spanId: 'step-span' });
    mockTraceSystem.completeSpan.mockResolvedValue(undefined);
    mockTraceSystem.query.mockReturnValue({ total: 0, traces: [], hasMore: false });
    mockTraceSystem.getMetrics.mockReturnValue({
      totalCalls: 1,
      successCount: 1,
      failureCount: 0,
      timeoutCount: 0,
      successRate: 100,
      avgDuration: 10,
      p50Duration: 10,
      p95Duration: 10,
      p99Duration: 10,
      maxDuration: 10,
      minDuration: 10,
      byModule: {},
    });
    mockTraceSystem.getAlerts.mockReturnValue([]);
    adapter = new WorkflowTraceAuditAdapter(mockDeps, { enabled: true });
  });

  it('should start trace on workflow start', async () => {
    const workflow = { id: 'wf-1', name: 'Test Workflow', mode: 'STRICT' } as Workflow;
    const result = await adapter.onWorkflowStart(workflow, 'exec-1', 'sess-1');
    
    expect(result.traceId).toBe('test-trace');
    expect(result.spanId).toBe('root-span');
  });

  it('should create span on step start', async () => {
    const step = { id: 'step-1', type: 'exec', cli: 'ls' } as Step;
    const spanId = await adapter.onStepStart('trace-1', 'parent-1', step, 'sess-1');
    
    expect(spanId).toBe('step-span');
  });

  it('should complete span on step complete', async () => {
    await adapter.onStepComplete('span-1', 'COMPLETED', { ok: true });

    expect(mockTraceSystem.completeSpan).toHaveBeenCalledWith(
      'span-1',
      'COMPLETED',
      { ok: true },
      undefined,
    );
  });

  it('should wrap primitive step output into a trace-safe record', async () => {
    await adapter.onStepComplete('span-1', 'SUCCESS', 'done');

    expect(mockTraceSystem.completeSpan).toHaveBeenCalledWith(
      'span-1',
      'COMPLETED',
      { value: 'done' },
      undefined,
    );
  });

  it('should complete root span on workflow complete', async () => {
    const execution = {
      executionId: 'exec-1',
      status: 'COMPLETED',
      steps: [],
      duration: 100,
    } as unknown as ExecutionRecord;
    
    await adapter.onWorkflowComplete('trace-1', execution);

    expect(mockTraceSystem.completeSpan).toHaveBeenCalledWith(
      'trace-1',
      'COMPLETED',
      {
        executionId: 'exec-1',
        stepCount: 0,
        duration: 100,
      },
      undefined,
    );
    expect(mockTraceSystem.refreshIndex).toHaveBeenCalled();
  });

  it('should expose typed empty defaults when trace system is disabled', () => {
    const disabledAdapter = new WorkflowTraceAuditAdapter(mockDeps, { enabled: false });

    const queryResult: TraceQueryResult = disabledAdapter.query();
    const metrics: TraceMetrics = disabledAdapter.getMetrics();
    const alerts: AlertEvent[] = disabledAdapter.getAlerts();
    const systemStats = disabledAdapter.getSystemStats();

    expect(queryResult).toEqual({ total: 0, traces: [], hasMore: false });
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.byModule).toEqual({});
    expect(alerts).toEqual([]);
    expect(systemStats.activeTraces).toBe(0);
    expect(systemStats.writer.isFlushing).toBe(false);
  });

  it('should forward typed query, metrics and alert calls', () => {
    const queryResult = { total: 1, traces: [], hasMore: false };
    const metrics = {
      totalCalls: 3,
      successCount: 2,
      failureCount: 1,
      timeoutCount: 0,
      successRate: 66.7,
      avgDuration: 20,
      p50Duration: 20,
      p95Duration: 30,
      p99Duration: 30,
      maxDuration: 30,
      minDuration: 10,
      byModule: {},
    };
    const alerts = [
      {
        id: 'alert-1',
        ruleId: 'rule-1',
        level: 'WARNING',
        message: 'slow',
        timestamp: new Date().toISOString(),
        currentValue: 12,
        threshold: 10,
        resolved: false,
      },
    ];

    mockTraceSystem.query.mockReturnValue(queryResult);
    mockTraceSystem.getMetrics.mockReturnValue(metrics);
    mockTraceSystem.getAlerts.mockReturnValue(alerts);

    expect(adapter.query({ status: 'COMPLETED' })).toEqual(queryResult);
    expect(adapter.getMetrics({ moduleName: 'WorkflowEngine' })).toEqual(metrics);
    expect(adapter.getAlerts({ resolved: false, limit: 1 })).toEqual(alerts);
    expect(mockTraceSystem.query).toHaveBeenCalledWith({ status: 'COMPLETED' });
    expect(mockTraceSystem.getMetrics).toHaveBeenCalledWith({ moduleName: 'WorkflowEngine' });
    expect(mockTraceSystem.getAlerts).toHaveBeenCalledWith({ resolved: false, limit: 1 });
  });

  it('should map unknown statuses to FAILED', async () => {
    await adapter.onStepComplete('span-1', 'mystery-status', { ok: true });

    expect(mockTraceSystem.completeSpan).toHaveBeenCalledWith(
      'span-1',
      'FAILED',
      { ok: true },
      undefined,
    );
  });
});
