/**
 * 链路追踪核心测试
 * Trace Core Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TraceCore, createTraceCore, withTrace } from './trace-core.js';
import { AsyncLogWriter, createAsyncLogWriter } from './async-writer.js';

const TEST_LOG_DIR = path.join(process.cwd(), 'test-logs-trace-core');

describe('TraceCore', () => {
  let writer: AsyncLogWriter;
  let traceCore: TraceCore;

  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
    writer = createAsyncLogWriter(TEST_LOG_DIR, {
      bufferSize: 100,
      flushIntervalMs: 100,
    });
    traceCore = createTraceCore(writer);
  });

  afterEach(async () => {
    await traceCore.destroy();
    await writer.destroy();
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('createTraceCore', () => {
    it('should create an instance', () => {
      expect(traceCore).toBeInstanceOf(TraceCore);
    });
  });

  describe('createTrace', () => {
    it('should create a new trace with root span', async () => {
      const trace = await traceCore.createTrace('Workflow', 'session_001', { env: 'test' });

      expect(trace.traceId).toBeDefined();
      expect(trace.rootSpanId).toBeDefined();
      expect(trace.spans).toHaveLength(1);
      expect(trace.status).toBe('RUNNING');
      expect(trace.sessionId).toBe('session_001');
      expect(trace.tags).toEqual({ env: 'test' });
      expect(trace.spans[0].callee).toBe('Workflow');
      expect(trace.spans[0].caller).toBe('system');
    });

    it('should create unique trace IDs', async () => {
      const trace1 = await traceCore.createTrace('Module1');
      const trace2 = await traceCore.createTrace('Module2');

      expect(trace1.traceId).not.toBe(trace2.traceId);
      expect(trace1.rootSpanId).not.toBe(trace2.rootSpanId);
    });
  });

  describe('createSpan', () => {
    it('should create a child span', async () => {
      const trace = await traceCore.createTrace('Workflow');
      const span = await traceCore.createSpan(
        trace.traceId,
        trace.rootSpanId,
        'Workflow',
        'Executor',
        { input: 'data' },
        { priority: 'high' }
      );

      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBe(trace.traceId);
      expect(span.parentSpanId).toBe(trace.rootSpanId);
      expect(span.caller).toBe('Workflow');
      expect(span.callee).toBe('Executor');
      expect(span.status).toBe('RUNNING');
      expect(trace.spans).toHaveLength(2);
    });

    it('should throw error when trace not found', async () => {
      await expect(
        traceCore.createSpan('nonexistent', 'span_001', 'A', 'B')
      ).rejects.toThrow('链路追踪不存在');
    });
  });

  describe('completeSpan', () => {
    it('should complete a span with success status', async () => {
      const trace = await traceCore.createTrace('Workflow');
      const span = await traceCore.createSpan(trace.traceId, trace.rootSpanId, 'Workflow', 'Executor');

      await traceCore.completeSpan(span.spanId, 'COMPLETED', { result: 'success' });

      const completedSpan = traceCore.getSpan(span.spanId);
      expect(completedSpan).toBeDefined();
      expect(completedSpan!.status).toBe('COMPLETED');
      expect(completedSpan!.endTime).toBeDefined();
      expect(completedSpan!.duration).toBeGreaterThan(0);
      expect(completedSpan!.output).toEqual({ result: 'success' });
    });

    it('should complete a span with failure status', async () => {
      const trace = await traceCore.createTrace('Workflow');
      const span = await traceCore.createSpan(trace.traceId, trace.rootSpanId, 'Workflow', 'Executor');

      await traceCore.completeSpan(span.spanId, 'FAILED', undefined, 'Error message');

      const completedSpan = traceCore.getSpan(span.spanId);
      expect(completedSpan!.status).toBe('FAILED');
      expect(completedSpan!.error).toBe('Error message');
      expect(trace.status).toBe('FAILED');
    });

    it('should throw error when span not found', async () => {
      await expect(
        traceCore.completeSpan('nonexistent', 'COMPLETED')
      ).rejects.toThrow('跨度不存在');
    });

    it('should complete trace when all spans are done', async () => {
      const trace = await traceCore.createTrace('Workflow');
      const span1 = await traceCore.createSpan(trace.traceId, trace.rootSpanId, 'Workflow', 'Executor');
      const span2 = await traceCore.createSpan(trace.traceId, trace.rootSpanId, 'Workflow', 'Storage');

      await traceCore.completeSpan(span1.spanId, 'COMPLETED');
      await traceCore.completeSpan(span2.spanId, 'COMPLETED');
      await traceCore.completeSpan(trace.rootSpanId, 'COMPLETED');

      const completedTrace = traceCore.getTrace(trace.traceId);
      expect(completedTrace!.endTime).toBeDefined();
      expect(completedTrace!.totalDuration).toBeGreaterThan(0);
    }, 10000);
  });

  describe('getTrace and getSpan', () => {
    it('should return trace by ID', async () => {
      const trace = await traceCore.createTrace('Workflow');
      const retrieved = traceCore.getTrace(trace.traceId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.traceId).toBe(trace.traceId);
    });

    it('should return undefined for nonexistent trace', () => {
      expect(traceCore.getTrace('nonexistent')).toBeUndefined();
    });

    it('should return span by ID', async () => {
      const trace = await traceCore.createTrace('Workflow');
      const span = traceCore.getSpan(trace.rootSpanId);

      expect(span).toBeDefined();
      expect(span!.spanId).toBe(trace.rootSpanId);
    });

    it('should return undefined for nonexistent span', () => {
      expect(traceCore.getSpan('nonexistent')).toBeUndefined();
    });
  });

  describe('getActiveTraceCount', () => {
    it('should return correct count of active traces', async () => {
      expect(traceCore.getActiveTraceCount()).toBe(0);

      const trace1 = await traceCore.createTrace('Module1');
      expect(traceCore.getActiveTraceCount()).toBe(1);

      const trace2 = await traceCore.createTrace('Module2');
      expect(traceCore.getActiveTraceCount()).toBe(2);

      await traceCore.completeSpan(trace1.rootSpanId, 'COMPLETED');
      await traceCore.completeSpan(trace2.rootSpanId, 'COMPLETED');

      expect(traceCore.getActiveTraceCount()).toBe(0);
    });
  });

  describe('getAllTraces', () => {
    it('should return all traces', async () => {
      await traceCore.createTrace('Module1');
      await traceCore.createTrace('Module2');
      await traceCore.createTrace('Module3');

      const allTraces = traceCore.getAllTraces();
      expect(allTraces).toHaveLength(3);
    });
  });

  describe('cleanupCompletedTraces', () => {
    it('should cleanup old completed traces', async () => {
      const trace = await traceCore.createTrace('Workflow');
      await traceCore.completeSpan(trace.rootSpanId, 'COMPLETED');

      const cleaned = traceCore.cleanupCompletedTraces(0);
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('withTrace utility', () => {
    it('should execute operation and complete span on success', async () => {
      const trace = await traceCore.createTrace('Workflow');

      const result = await withTrace(
        traceCore,
        trace.traceId,
        trace.rootSpanId,
        'Workflow',
        'Executor',
        async () => 'success',
        { input: 'data' }
      );

      expect(result).toBe('success');
    });

    it('should complete span with failure on error', async () => {
      const trace = await traceCore.createTrace('Workflow');

      await expect(
        withTrace(
          traceCore,
          trace.traceId,
          trace.rootSpanId,
          'Workflow',
          'Executor',
          async () => {
            throw new Error('Test error');
          }
        )
      ).rejects.toThrow('Test error');
    });
  });
});
