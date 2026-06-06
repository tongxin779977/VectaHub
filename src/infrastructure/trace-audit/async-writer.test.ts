/**
 * 异步日志写入器测试
 * Async Log Writer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { AsyncLogWriter, createAsyncLogWriter } from './async-writer.js';
import { LogRotationManager } from './log-rotation.js';
import type { TraceSpan } from './types.js';

const TEST_LOG_DIR = path.join(process.cwd(), 'test-logs-traces');
const TEST_LOGGER = pino({ level: 'silent' });

describe('AsyncLogWriter', () => {
  let writer: AsyncLogWriter;

  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
    writer = createAsyncLogWriter(TEST_LOG_DIR, {
      bufferSize: 5,
      flushIntervalMs: 100,
    }, { logger: TEST_LOGGER });
  });

  afterEach(async () => {
    await writer.destroy();
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('createAsyncLogWriter', () => {
    it('should create an instance with default config', () => {
      const w = createAsyncLogWriter(TEST_LOG_DIR, undefined, { logger: TEST_LOGGER });
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

    it('should reject discarded promise when queue overflows', async () => {
      const overflowWriter = createAsyncLogWriter(TEST_LOG_DIR, {
        bufferSize: 100,
        flushIntervalMs: 10_000,
        maxQueueLength: 2,
      }, { logger: TEST_LOGGER });

      const makeSpan = (id: string): TraceSpan => ({
        spanId: id,
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      });

      // Fill the queue to maxQueueLength (2)
      const p1 = overflowWriter.write(makeSpan('span_001'));
      const p2 = overflowWriter.write(makeSpan('span_002'));
      expect(overflowWriter.getQueueLength()).toBe(2);

      // This write should trigger queue overflow, discarding span_001
      const p3 = overflowWriter.write(makeSpan('span_003'));
      expect(overflowWriter.getQueueLength()).toBe(2);

      // The discarded item's promise should be rejected
      await expect(p1).rejects.toThrow('日志队列已满，该条日志被丢弃');

      // The other promises should still be resolvable via flush
      await overflowWriter.flush();
      await expect(p2).resolves.toBeUndefined();
      await expect(p3).resolves.toBeUndefined();

      await overflowWriter.destroy();
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
      }, { logger: TEST_LOGGER });

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

    it('should keep current batch in queue when flush fails', async () => {
      const brokenLogDir = path.join(TEST_LOG_DIR, 'broken-dir');
      const brokenWriter = createAsyncLogWriter(brokenLogDir, {
        bufferSize: 10,
        flushIntervalMs: 10_000,
      }, { logger: TEST_LOGGER });

      const span: TraceSpan = {
        spanId: 'span_fail_001',
        traceId: 'trace_fail_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'RUNNING',
      };

      const pendingWrite = brokenWriter.write(span);

      fs.rmSync(brokenLogDir, { recursive: true, force: true });
      fs.writeFileSync(brokenLogDir, 'not-a-directory', 'utf-8');

      await expect(brokenWriter.flush()).rejects.toThrow();
      expect(brokenWriter.getQueueLength()).toBe(1);

      fs.rmSync(brokenLogDir, { force: true });
      fs.mkdirSync(brokenLogDir, { recursive: true });

      await brokenWriter.flush();
      await expect(pendingWrite).resolves.toBeUndefined();
      expect(brokenWriter.getQueueLength()).toBe(0);

      const logFile = path.join(brokenLogDir, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      expect(fs.existsSync(logFile)).toBe(true);

      await brokenWriter.destroy();
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

    it('should flush queued data before marking destroyed', async () => {
      const span: TraceSpan = {
        spanId: 'span_destroy_001',
        traceId: 'trace_destroy_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
      };

      const pendingWrite = writer.write(span);
      await writer.destroy();
      await expect(pendingWrite).resolves.toBeUndefined();

      const logFile = path.join(TEST_LOG_DIR, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('"spanId":"span_destroy_001"');
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

  describe('pause / resume', () => {
    it('should flush buffered data to disk during pause()', async () => {
      const testDir = path.join(TEST_LOG_DIR, 'pause-flush');
      const pauseWriter = createAsyncLogWriter(
        testDir,
        { bufferSize: 100, flushIntervalMs: 60_000 },
        { logger: TEST_LOGGER }
      );

      try {
        const span: TraceSpan = {
          spanId: 'span_pause_001',
          traceId: 'trace_pause_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };

        // Push to queue without triggering auto-flush (bufferSize=100)
        const writePromise = pauseWriter.write(span);
        expect(pauseWriter.getQueueLength()).toBe(1);

        // pause() should flush the buffer first, then set isPaused
        await pauseWriter.pause();

        // The write promise should be resolved (flushed during pause)
        await writePromise;

        // Data should be on disk
        expect(pauseWriter.getQueueLength()).toBe(0);
        const logFile = path.join(testDir, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
        expect(fs.existsSync(logFile)).toBe(true);
        expect(fs.readFileSync(logFile, 'utf-8')).toContain('span_pause_001');
      } finally {
        await pauseWriter.destroy();
      }
    });

    it('should set isPaused after flushing so flush() is blocked', async () => {
      const testDir = path.join(TEST_LOG_DIR, 'pause-block');
      const pauseWriter = createAsyncLogWriter(
        testDir,
        { bufferSize: 100, flushIntervalMs: 60_000 },
        { logger: TEST_LOGGER }
      );

      try {
        // Write and manually flush first item
        const span1: TraceSpan = {
          spanId: 'span_blocked_001',
          traceId: 'trace_blocked_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };
        const wp1 = pauseWriter.write(span1);
        await pauseWriter.flush();
        await wp1;
        expect(pauseWriter.getQueueLength()).toBe(0);

        // Pause the writer (queue is empty, flush is a no-op, then isPaused=true)
        await pauseWriter.pause();
        expect(pauseWriter.getStats().isPaused).toBe(true);

        // Write while paused - data goes to queue but auto-flush is blocked
        const span2: TraceSpan = {
          spanId: 'span_blocked_002',
          traceId: 'trace_blocked_002',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };
        const wp2 = pauseWriter.write(span2);
        expect(pauseWriter.getQueueLength()).toBe(1);

        // flush() should be a no-op while paused
        await pauseWriter.flush();
        expect(pauseWriter.getQueueLength()).toBe(1);

        // Resume and flush
        pauseWriter.resume();
        expect(pauseWriter.getStats().isPaused).toBe(false);
        await pauseWriter.flush();
        await wp2;

        expect(pauseWriter.getQueueLength()).toBe(0);
        const logFile = path.join(testDir, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
        const fileContent = fs.readFileSync(logFile, 'utf-8');
        expect(fileContent).toContain('span_blocked_001');
        expect(fileContent).toContain('span_blocked_002');
      } finally {
        await pauseWriter.destroy();
      }
    });

    it('pauseAll should flush and pause all active writers, resumeAll should resume them', async () => {
      const testDir1 = path.join(TEST_LOG_DIR, 'pauseall-1');
      const testDir2 = path.join(TEST_LOG_DIR, 'pauseall-2');
      const writer1 = createAsyncLogWriter(
        testDir1,
        { bufferSize: 100, flushIntervalMs: 60_000 },
        { logger: TEST_LOGGER }
      );
      const writer2 = createAsyncLogWriter(
        testDir2,
        { bufferSize: 100, flushIntervalMs: 60_000 },
        { logger: TEST_LOGGER }
      );

      try {
        const span1: TraceSpan = {
          spanId: 'span_all_001',
          traceId: 'trace_all_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };
        const span2: TraceSpan = {
          spanId: 'span_all_002',
          traceId: 'trace_all_002',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };

        const wp1 = writer1.write(span1);
        const wp2 = writer2.write(span2);

        // pauseAll should flush all writers and set isPaused
        await AsyncLogWriter.pauseAll();

        expect(writer1.getStats().isPaused).toBe(true);
        expect(writer2.getStats().isPaused).toBe(true);

        // Data should have been flushed
        await wp1;
        await wp2;
        expect(writer1.getQueueLength()).toBe(0);
        expect(writer2.getQueueLength()).toBe(0);

        // Resume all
        AsyncLogWriter.resumeAll();
        expect(writer1.getStats().isPaused).toBe(false);
        expect(writer2.getStats().isPaused).toBe(false);
      } finally {
        await writer1.destroy();
        await writer2.destroy();
      }
    });
  });

  describe('LogRotationManager integration', () => {
    it('should pause writers during rotation and resume after', async () => {
      const rotationDir = path.join(TEST_LOG_DIR, 'rotation-test');
      fs.mkdirSync(rotationDir, { recursive: true });

      // Create a writer with large buffer so we control when flush happens
      const rotWriter = createAsyncLogWriter(
        rotationDir,
        { bufferSize: 100, flushIntervalMs: 60_000 },
        { logger: TEST_LOGGER }
      );

      try {
        // Write some data to queue
        const span: TraceSpan = {
          spanId: 'span_rotation_001',
          traceId: 'trace_rotation_001',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };
        const writePromise = rotWriter.write(span);
        expect(rotWriter.getQueueLength()).toBe(1);

        // Create a rotation manager
        const rotationManager = new LogRotationManager(
          rotationDir,
          { enabled: true, maxFileSizeMB: 0.001, retentionDays: 30, compressArchive: false },
          { logger: TEST_LOGGER }
        );

        // rotate() should pause all writers (flushing first), do rotation, then resume
        await rotationManager.rotate();

        // The write should have been resolved (flushed during pause)
        await writePromise;

        // Writer should be resumed after rotation
        expect(rotWriter.getStats().isPaused).toBe(false);

        // Writer should still be functional after rotation
        const span2: TraceSpan = {
          spanId: 'span_rotation_002',
          traceId: 'trace_rotation_002',
          caller: 'CLI',
          callee: 'Workflow',
          startTime: new Date().toISOString(),
          status: 'RUNNING',
        };
        const wp2 = rotWriter.write(span2);
        await rotWriter.flush();
        await wp2;

        const logFile = path.join(rotationDir, `${new Date().toISOString().split('T')[0]}-traces.jsonl`);
        expect(fs.existsSync(logFile)).toBe(true);
      } finally {
        await rotWriter.destroy();
        fs.rmSync(rotationDir, { recursive: true, force: true });
      }
    });
  });
});
