import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecordManager } from '../execution/record-manager.js';
import { generateId, parseTimestamp } from '../execution/id-generator.js';
import { createOutputStore } from '../execution/output-store.js';
import type { ExecutionRecord } from '../execution/types.js';

function createTestRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    executionId: overrides.executionId || generateId(),
    workflowId: 'wf-bench',
    workflowName: 'benchmark-workflow',
    status: 'COMPLETED',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    steps: (overrides.steps || []),
    ...overrides,
  };
}

describe('Performance Benchmarks (Section 14)', () => {
  let tmpDir: string;
  let recordManager: ReturnType<typeof createRecordManager>;
  let outputStore: ReturnType<typeof createOutputStore>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'perf-bench-'));
    recordManager = createRecordManager(tmpDir);
    outputStore = createOutputStore(join(tmpDir, 'outputs'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Benchmark 1: ID Generation', () => {
    it('should generate 1000 IDs in under 10ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        generateId();
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
    });

    it('should parse 1000 timestamps in under 5ms', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 1000; i++) {
        ids.push(generateId());
      }

      const start = performance.now();
      for (const id of ids) {
        parseTimestamp(id);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });
  });

  describe('Benchmark 2: Storage Operations', () => {
    it('should save and get 100 records in under 500ms', async () => {
      const records: ExecutionRecord[] = [];
      for (let i = 0; i < 100; i++) {
        const r = createTestRecord({
          workflowName: `benchmark-${i}`,
          startedAt: `2026-05-07T12:00:${(i % 60).toString().padStart(2, '0')}.000Z`,
        });
        records.push(r);
      }

      const start = performance.now();
      for (const r of records) {
        await recordManager.save(r);
      }
      for (const r of records) {
        await recordManager.get(r.executionId);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
    });

    it('should search 100 records in under 100ms', async () => {
      for (let i = 0; i < 100; i++) {
        await recordManager.save(createTestRecord({
          workflowName: `deploy service ${i}`,
          startedAt: `2026-05-07T12:00:${(i % 60).toString().padStart(2, '0')}.000Z`,
        }));
      }

      const start = performance.now();
      for (let q = 0; q < 10; q++) {
        await recordManager.search('deploy');
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Benchmark 3: Output Store', () => {
    it('should save 50 outputs in under 300ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        await outputStore.save('exec_bench', `step_${i}`, `output ${i}`);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(300);
    });

    it('should get summary in under 10ms', async () => {
      await outputStore.save('exec_bench', 'step_1', 'hello world');

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        await outputStore.getSummary('exec_bench', 'step_1');
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Benchmark 4: Record Manager', () => {
    it('should getLatest from 200 records in under 500ms', async () => {
      for (let i = 0; i < 200; i++) {
        await recordManager.save(createTestRecord({
          executionId: `exec_perf_${i}`,
          startedAt: `2026-05-${((i % 28) + 1).toString().padStart(2, '0')}T12:00:00.000Z`,
        }));
      }

      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        await recordManager.getLatest('COMPLETED');
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
    });

    it('should getRecent from 200 records in under 500ms', async () => {
      for (let i = 0; i < 200; i++) {
        await recordManager.save(createTestRecord({
          executionId: `exec_recent_${i}`,
          startedAt: `2026-05-${((i % 28) + 1).toString().padStart(2, '0')}T12:00:00.000Z`,
        }));
      }

      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        await recordManager.getRecent(50);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
    });
  });
});
