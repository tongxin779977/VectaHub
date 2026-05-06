import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecordManager } from './record-manager.js';
import type { ExecutionRecord, ExecutionFilter } from './types.js';

function createTestRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  const defaults: ExecutionRecord = {
    executionId: 'exec_20260507_120000_a1b2',
    workflowId: 'wf-1',
    workflowName: 'test-workflow',
    status: 'COMPLETED',
    startedAt: '2026-05-07T12:00:00.000Z',
    finishedAt: '2026-05-07T12:00:01.000Z',
    duration: 1000,
    steps: [],
  };
  return { ...defaults, ...overrides };
}

describe('RecordManager', () => {
  let tmpDir: string;
  let manager: ReturnType<typeof createRecordManager>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'record-manager-test-'));
    manager = createRecordManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find record after save', async () => {
    const record = createTestRecord();
    await manager.save(record);
    const found = await manager.get(record.executionId);
    expect(found).toEqual(record);
  });

  it('should return empty array when no records exist', async () => {
    const records = await manager.list();
    expect(records).toEqual([]);
  });

  it('should list records with default ordering (newest first)', async () => {
    const r1 = createTestRecord({
      executionId: 'exec_20260507_120000_a1b2',
      startedAt: '2026-05-07T12:00:00.000Z',
    });
    const r2 = createTestRecord({
      executionId: 'exec_20260507_120001_c3d4',
      startedAt: '2026-05-07T12:00:01.000Z',
    });
    await manager.save(r1);
    await manager.save(r2);
    const records = await manager.list();
    expect(records).toHaveLength(2);
    expect(records[0].executionId).toBe('exec_20260507_120001_c3d4');
    expect(records[1].executionId).toBe('exec_20260507_120000_a1b2');
  });

  it('should filter records by workflowId', async () => {
    await manager.save(createTestRecord({ executionId: 'exec_1', workflowId: 'wf-1' }));
    await manager.save(createTestRecord({ executionId: 'exec_2', workflowId: 'wf-2' }));
    await manager.save(createTestRecord({ executionId: 'exec_3', workflowId: 'wf-1' }));

    const filtered = await manager.list({ workflowId: 'wf-1' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.workflowId === 'wf-1')).toBe(true);
  });

  it('should filter records by status', async () => {
    await manager.save(createTestRecord({ executionId: 'exec_1', status: 'COMPLETED' }));
    await manager.save(createTestRecord({ executionId: 'exec_2', status: 'FAILED' }));
    await manager.save(createTestRecord({ executionId: 'exec_3', status: 'COMPLETED' }));

    const filtered = await manager.list({ status: 'FAILED' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].executionId).toBe('exec_2');
  });

  it('should filter records by date range', async () => {
    await manager.save(createTestRecord({
      executionId: 'exec_1',
      startedAt: '2026-05-01T12:00:00.000Z',
    }));
    await manager.save(createTestRecord({
      executionId: 'exec_2',
      startedAt: '2026-05-07T12:00:00.000Z',
    }));
    await manager.save(createTestRecord({
      executionId: 'exec_3',
      startedAt: '2026-05-10T12:00:00.000Z',
    }));

    const filtered = await manager.list({
      from: '2026-05-05T00:00:00.000Z',
      to: '2026-05-09T00:00:00.000Z',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].executionId).toBe('exec_2');
  });

  it('should apply limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.save(createTestRecord({
        executionId: `exec_${i}`,
        startedAt: `2026-05-07T12:00:0${i}.000Z`,
      }));
    }

    const limited = await manager.list({ limit: 2 });
    expect(limited).toHaveLength(2);

    const offset = await manager.list({ limit: 2, offset: 2 });
    expect(offset).toHaveLength(2);
    expect(offset[0].executionId).not.toBe(limited[0].executionId);
  });

  it('should not find record after delete', async () => {
    const record = createTestRecord();
    await manager.save(record);
    const deleted = await manager.delete(record.executionId);
    expect(deleted).toBe(true);
    const found = await manager.get(record.executionId);
    expect(found).toBeUndefined();
  });

  it('should return false when deleting non-existent record', async () => {
    const deleted = await manager.delete('exec_nonexistent');
    expect(deleted).toBe(false);
  });

  it('should grep records by workflow name', async () => {
    await manager.save(createTestRecord({ executionId: 'exec_1', workflowName: 'deploy-app' }));
    await manager.save(createTestRecord({ executionId: 'exec_2', workflowName: 'run-tests' }));
    await manager.save(createTestRecord({ executionId: 'exec_3', workflowName: 'deploy-service' }));

    const filtered = await manager.list({ grep: 'deploy' });
    expect(filtered).toHaveLength(2);
  });

  describe('search', () => {
    it('should search across multiple fields', async () => {
      await manager.save(createTestRecord({
        executionId: 'exec_search1',
        workflowName: 'deploy production',
        status: 'COMPLETED',
      }));
      await manager.save(createTestRecord({
        executionId: 'exec_search2',
        workflowName: 'run unit tests',
        status: 'FAILED',
        error: 'timeout exceeded',
      }));

      const result = await manager.search('deploy');
      expect(result.total).toBe(1);
      expect(result.records[0].workflowName).toBe('deploy production');
    });

    it('should filter by status in search', async () => {
      await manager.save(createTestRecord({
        executionId: 'exec_1',
        status: 'COMPLETED',
        workflowName: 'build app',
      }));
      await manager.save(createTestRecord({
        executionId: 'exec_2',
        status: 'FAILED',
        workflowName: 'deploy app',
      }));

      const result = await manager.search('app', { status: 'FAILED' });
      expect(result.total).toBe(1);
      expect(result.records[0].status).toBe('FAILED');
    });

    it('should apply limit and hasMore', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.save(createTestRecord({
          executionId: `exec_lim${i}`,
          workflowName: `test workflow ${i}`,
          startedAt: `2026-05-07T12:00:0${i}.000Z`,
        }));
      }

      const result = await manager.search('test', { limit: 2 });
      expect(result.hasMore).toBe(true);
      expect(result.records).toHaveLength(2);
    });

    it('should return empty result for no match', async () => {
      await manager.save(createTestRecord({ workflowName: 'build' }));
      const result = await manager.search('nonexistent');
      expect(result.total).toBe(0);
      expect(result.records).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata when present', async () => {
      await manager.save(createTestRecord({
        executionId: 'exec_meta',
        metadata: { source: 'nl', cwd: '/tmp/test' },
      }));

      const meta = await manager.getMetadata('exec_meta');
      expect(meta).toBeDefined();
      expect(meta!.source).toBe('nl');
    });

    it('should return undefined when no metadata', async () => {
      await manager.save(createTestRecord({ executionId: 'exec_nometa' }));
      const meta = await manager.getMetadata('exec_nometa');
      expect(meta).toBeUndefined();
    });

    it('should return undefined for non-existent record', async () => {
      const meta = await manager.getMetadata('exec_missing');
      expect(meta).toBeUndefined();
    });
  });

  describe('getLatest', () => {
    it('should return the most recent record', async () => {
      await manager.save(createTestRecord({
        executionId: 'exec_old',
        startedAt: '2026-05-01T12:00:00.000Z',
      }));
      await manager.save(createTestRecord({
        executionId: 'exec_new',
        startedAt: '2026-05-07T12:00:00.000Z',
      }));

      const latest = await manager.getLatest();
      expect(latest).toBeDefined();
      expect(latest!.executionId).toBe('exec_new');
    });

    it('should filter by status', async () => {
      await manager.save(createTestRecord({
        executionId: 'exec_ok',
        status: 'COMPLETED',
        startedAt: '2026-05-07T12:00:00.000Z',
      }));
      await manager.save(createTestRecord({
        executionId: 'exec_fail',
        status: 'FAILED',
        startedAt: '2026-05-08T12:00:00.000Z',
      }));

      const latest = await manager.getLatest('COMPLETED');
      expect(latest).toBeDefined();
      expect(latest!.status).toBe('COMPLETED');
    });
  });

  describe('getRecent', () => {
    it('should return the most recent N records', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.save(createTestRecord({
          executionId: `exec_recent${i}`,
          startedAt: `2026-05-0${i + 1}T12:00:00.000Z`,
        }));
      }

      const recent = await manager.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].executionId).toBe('exec_recent4');
    });

    it('should return all records when limit exceeds count', async () => {
      await manager.save(createTestRecord({ executionId: 'exec_r1' }));
      const recent = await manager.getRecent(100);
      expect(recent).toHaveLength(1);
    });
  });
});
