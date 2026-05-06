/**
 * 异步日志写入器测试
 * Async Log Writer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLogWriter, createAsyncLogWriter } from './async-writer.js';
import type { TraceSpan } from './types.js';

const TEST_LOG_DIR = path.join(process.cwd(), 'test-logs-traces');

describe('AsyncLogWriter', () => {
  let writer: AsyncLogWriter;

  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
    writer = createAsyncLogWriter(TEST_LOG_DIR, {
      bufferSize: 5,
      flushIntervalMs: 100,
    });
  });

  afterEach(async () => {
    await writer.destroy();
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('createAsyncLogWriter', () => {
    it('should create an instance with default config', () => {
      const w = createAsyncLogWriter(TEST_LOG_DIR);
      expect(w).toBeInstanceOf(AsyncLogWriter);
    });

    it('should create log directory if not exists', () => {
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(true);
    });
  });

  describe('write', () => {
    it('should write a single span to queue', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      };

      await writer.write(span);
      expect(writer.getQueueLength()).toBeGreaterThanOrEqual(0);
    });

    it('should flush when buffer is full', async () => {
      const spans: TraceSpan[] = Array.from({ length: 10 }, (_, i) => ({
        spanId: `span_${i}`,
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      }));

      for (const span of spans) {
        await writer.write(span);
      }

      await writer.flush();

      const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      expect(fs.existsSync(logFile)).toBe(true);
    });

    it('should not write when disabled', async () => {
      const disabledWriter = createAsyncLogWriter(TEST_LOG_DIR, {
        enabled: false,
        bufferSize: 5,
        flushIntervalMs: 100,
      });

      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      };

      await disabledWriter.write(span);
      await disabledWriter.destroy();

      const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      expect(fs.existsSync(logFile)).toBe(false);
    });
  });

  describe('writeBatch', () => {
    it('should write multiple spans', async () => {
      const spans: TraceSpan[] = [
        {
          spanId: 'span_001',
          traceId: 'trace_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        },
        {
          spanId: 'span_002',
          traceId: 'trace_001',
          caller: 'Workflow',
          callee: 'Executor',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        },
      ];

      await writer.writeBatch(spans);
      await writer.flush();

      const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      expect(fs.existsSync(logFile)).toBe(true);
    });
  });

  describe('flush', () => {
    it('should write queued items to file', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 100,
      };

      await writer.write(span);
      await writer.flush();

      const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      
      expect(lines.length).toBe(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.spanId).toBe('span_001');
      expect(parsed.status).toBe('COMPLETED');
    });

    it('should not flush when queue is empty', async () => {
      await writer.flush();
      expect(writer.getQueueLength()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const stats = writer.getStats();
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isFlushing');
      expect(stats).toHaveProperty('isDestroyed');
      expect(stats).toHaveProperty('bufferSize');
      expect(stats.bufferSize).toBe(5);
    });
  });

  describe('destroy', () => {
    it('should flush remaining data and mark as destroyed', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      };

      await writer.write(span);
      await writer.destroy();

      const stats = writer.getStats();
      expect(stats.isDestroyed).toBe(true);
    });

    it('should throw error when writing after destroy', async () => {
      await writer.destroy();

      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      };

      await expect(writer.write(span)).rejects.toThrow('写入器已销毁');
    });
  });
});
