/**
 * 多维度查询引擎测试
 * Query Engine Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { QueryEngine, createQueryEngine } from './query-engine.js';
import type { TraceSpan } from './types.js';

const TEST_LOG_DIR = path.join(process.cwd(), 'test-logs-query');
const TEST_LOGGER = pino({ level: 'silent' });

describe('QueryEngine', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
    engine = createQueryEngine(TEST_LOG_DIR, { logger: TEST_LOGGER });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  function writeTestSpans(spans: TraceSpan[]): void {
    const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
    const lines = spans.map((span) => JSON.stringify(span)).join('\n') + '\n';
    fs.writeFileSync(logFile, lines, 'utf-8');
  }

  describe('createQueryEngine', () => {
    it('should create an instance', () => {
      expect(engine).toBeInstanceOf(QueryEngine);
    });
  });

  describe('loadLogs', () => {
    it('should load logs from files', () => {
      const spans: TraceSpan[] = [
        {
          spanId: 'span_001',
          traceId: 'trace_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: '2026-05-06T10:00:00Z',
          status: 'COMPLETED',
          duration: 100,
        },
        {
          spanId: 'span_002',
          traceId: 'trace_001',
          caller: 'Workflow',
          callee: 'Executor',
          startTime: '2026-05-06T10:00:01Z',
          status: 'COMPLETED',
          duration: 200,
        },
      ];

      writeTestSpans(spans);
      engine.loadLogs();

      const stats = engine.getIndexStats();
      expect(stats.spanCount).toBe(2);
      expect(stats.traceCount).toBe(1);
    });

    it('should handle empty directory', () => {
      engine.loadLogs();
      const stats = engine.getIndexStats();
      expect(stats.spanCount).toBe(0);
    });

    it('should handle malformed JSON lines', () => {
      const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      fs.writeFileSync(logFile, 'invalid json\n{"spanId":"span_001"}\n', 'utf-8');

      engine.loadLogs();
      const stats = engine.getIndexStats();
      expect(stats.spanCount).toBe(1);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      const spans: TraceSpan[] = [
        {
          spanId: 'span_001',
          traceId: 'trace_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: '2026-05-06T10:00:00Z',
          status: 'COMPLETED',
          duration: 100,
          sessionId: 'session_001',
        },
        {
          spanId: 'span_002',
          traceId: 'trace_001',
          caller: 'Workflow',
          callee: 'Executor',
          startTime: '2026-05-06T10:00:01Z',
          status: 'FAILED',
          duration: 5000,
          error: 'Timeout error',
          sessionId: 'session_001',
        },
        {
          spanId: 'span_003',
          traceId: 'trace_002',
          caller: 'CLI',
          callee: 'Storage',
          startTime: '2026-05-06T11:00:00Z',
          status: 'COMPLETED',
          duration: 50,
          sessionId: 'session_002',
          tags: { env: 'production' },
        },
      ];

      writeTestSpans(spans);
      engine.loadLogs();
    });

    it('should return all traces without filters', () => {
      const result = engine.query();
      expect(result.total).toBe(3);
      expect(result.traces.length).toBeGreaterThan(0);
    });

    it('should filter by traceId', () => {
      const result = engine.query({ traceId: 'trace_001' });
      expect(result.total).toBe(2);
    });

    it('should filter by spanId', () => {
      const result = engine.query({ spanId: 'span_001' });
      expect(result.total).toBe(1);
    });

    it('should filter by moduleName', () => {
      const result = engine.query({ moduleName: 'Workflow' });
      expect(result.total).toBe(1);
    });

    it('should filter by status', () => {
      const result = engine.query({ status: 'COMPLETED' });
      expect(result.total).toBe(2);
    });

    it('should filter by time range', () => {
      const result = engine.query({
        startTimeFrom: '2026-05-06T10:30:00Z',
      });
      expect(result.total).toBe(1);
    });

    it('should filter by duration range', () => {
      const result = engine.query({
        durationMin: 100,
        durationMax: 1000,
      });
      expect(result.total).toBe(1);
    });

    it('should filter by tags', () => {
      const result = engine.query({
        tags: { env: 'production' },
      });
      expect(result.total).toBe(1);
    });

    it('should filter by sessionId', () => {
      const result = engine.query({ sessionId: 'session_002' });
      expect(result.total).toBe(1);
    });

    it('should filter by errorKeyword', () => {
      const result = engine.query({ errorKeyword: 'Timeout' });
      expect(result.total).toBe(1);
    });

    it('should sort by startTime descending', () => {
      const result = engine.query({ sortBy: 'startTime', sortOrder: 'desc' });
      expect(result.total).toBe(3);
    });

    it('should paginate results', () => {
      const result = engine.query({ limit: 2, offset: 0 });
      expect(result.traces.length).toBeLessThanOrEqual(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      const spans: TraceSpan[] = Array.from({ length: 10 }, (_, i) => ({
        spanId: `span_${i}`,
        traceId: `trace_${Math.floor(i / 2)}`,
        caller: 'CLI',
        callee: i % 2 === 0 ? 'Workflow' : 'Executor',
        startTime: `2026-05-06T10:00:${i.toString().padStart(2, '0')}Z`,
        status: i < 8 ? 'COMPLETED' : 'FAILED',
        duration: (i + 1) * 100,
      }));

      writeTestSpans(spans);
      engine.loadLogs();
    });

    it('should calculate correct metrics', () => {
      const metrics = engine.getMetrics();

      expect(metrics.totalCalls).toBe(10);
      expect(metrics.successCount).toBe(8);
      expect(metrics.failureCount).toBe(2);
      expect(metrics.successRate).toBe(80);
      expect(metrics.avgDuration).toBeGreaterThan(0);
      expect(metrics.p50Duration).toBeGreaterThan(0);
      expect(metrics.p95Duration).toBeGreaterThan(0);
      expect(metrics.p99Duration).toBeGreaterThan(0);
    });

    it('should filter metrics by moduleName', () => {
      const metrics = engine.getMetrics({ moduleName: 'Workflow' });
      expect(metrics.totalCalls).toBe(5);
    });

    it('should filter metrics by time range', () => {
      const metrics = engine.getMetrics({
        startTimeFrom: '2026-05-06T10:00:05Z',
      });
      expect(metrics.totalCalls).toBe(5);
    });

    it('should return byModule breakdown', () => {
      const metrics = engine.getMetrics();
      expect(metrics.byModule).toHaveProperty('Workflow');
      expect(metrics.byModule).toHaveProperty('Executor');
      expect(metrics.byModule.Workflow.calls).toBe(5);
    });
  });

  describe('getTopology', () => {
    beforeEach(() => {
      const spans: TraceSpan[] = [
        {
          spanId: 'span_root',
          traceId: 'trace_001',
          caller: 'system',
          callee: 'CLI',
          startTime: '2026-05-06T10:00:00Z',
          status: 'COMPLETED',
          duration: 300,
        },
        {
          spanId: 'span_001',
          traceId: 'trace_001',
          parentSpanId: 'span_root',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: '2026-05-06T10:00:01Z',
          status: 'COMPLETED',
          duration: 200,
        },
      ];

      writeTestSpans(spans);
      engine.loadLogs();
    });

    it('should return topology graph', () => {
      const topology = engine.getTopology('trace_001');
      expect(topology.nodes.length).toBe(2);
      expect(topology.edges.length).toBe(1);
      expect(topology.edges[0].source).toBe('span_root');
      expect(topology.edges[0].target).toBe('span_001');
    });

    it('should return empty topology for nonexistent trace', () => {
      const topology = engine.getTopology('nonexistent');
      expect(topology.nodes).toEqual([]);
      expect(topology.edges).toEqual([]);
    });
  });

  describe('refresh', () => {
    it('should reload logs and rebuild indexes', () => {
      const spans: TraceSpan[] = [
        {
          spanId: 'span_001',
          traceId: 'trace_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: '2026-05-06T10:00:00Z',
          status: 'COMPLETED',
          duration: 100,
        },
      ];

      writeTestSpans(spans);
      engine.loadLogs();

      const stats1 = engine.getIndexStats();
      expect(stats1.spanCount).toBe(1);

      engine.refresh();
      const stats2 = engine.getIndexStats();
      expect(stats2.spanCount).toBe(1);
    });
  });

  describe('getIndexStats', () => {
    it('should return correct index statistics', () => {
      const spans: TraceSpan[] = [
        {
          spanId: 'span_001',
          traceId: 'trace_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: '2026-05-06T10:00:00Z',
          status: 'COMPLETED',
          duration: 100,
        },
        {
          spanId: 'span_002',
          traceId: 'trace_002',
          caller: 'CLI',
          callee: 'Executor',
          startTime: '2026-05-06T10:00:01Z',
          status: 'COMPLETED',
          duration: 200,
        },
      ];

      writeTestSpans(spans);
      engine.loadLogs();

      const stats = engine.getIndexStats();
      expect(stats.traceCount).toBe(2);
      expect(stats.spanCount).toBe(2);
      expect(stats.moduleCount).toBe(2);
    });
  });
});
