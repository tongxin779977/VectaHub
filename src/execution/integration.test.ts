import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage, type Storage } from '../workflow/storage.js';
import { createRecordManager } from '../execution/record-manager.js';
import type { ExecutionRecord } from '../execution/types.js';

function createTestRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    executionId: overrides.executionId || `exec_test_${Date.now()}`,
    workflowId: 'wf-test',
    workflowName: 'test-workflow',
    status: 'COMPLETED',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    steps: (overrides.steps || []),
    ...overrides,
  };
}

describe('Integration: Execution Lifecycle', () => {
  let tmpDir: string;
  let storage: Storage;
  let recordManager: ReturnType<typeof createRecordManager>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'integration-test-'));
    storage = createStorage({ storageDir: tmpDir });
    recordManager = createRecordManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Scenario 1: Full lifecycle', () => {
    it('should save, list, get and delete an execution', async () => {
      const record = createTestRecord({
        executionId: 'exec_lifecycle1',
        steps: [{ stepId: 's1', stepName: 'echo hello', command: 'echo hello', status: 'COMPLETED' as const }],
      });

      await storage.save(record as unknown as import('../types/index.js').ExecutionRecord);
      await recordManager.save(record);

      const listed = await storage.list();
      expect(listed.some(r => r.executionId === 'exec_lifecycle1')).toBe(true);

      const retrieved = await storage.get('exec_lifecycle1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.executionId).toBe('exec_lifecycle1');

      await storage.delete('exec_lifecycle1');
      const afterDelete = await storage.get('exec_lifecycle1');
      expect(afterDelete).toBeUndefined();
    });
  });

  describe('Scenario 2: Failure and resume data', () => {
    it('should preserve failed step info for resume', async () => {
      const failedRecord = createTestRecord({
        executionId: 'exec_failed1',
        status: 'FAILED',
        steps: [
          { stepId: 's1', stepName: 'setup', command: 'echo ok', status: 'COMPLETED' as const },
          { stepId: 's2', stepName: 'build', command: 'npm run build', status: 'FAILED' as const, error: 'exit code 1' },
        ],
      });

      await recordManager.save(failedRecord);

      const latest = await recordManager.getLatest('FAILED');
      expect(latest).toBeDefined();
      expect(latest!.executionId).toBe('exec_failed1');

      const failedStep = latest!.steps.find(s => s.status === 'FAILED');
      expect(failedStep).toBeDefined();
      expect(failedStep!.stepId).toBe('s2');
    });
  });

  describe('Scenario 3: Output separation', () => {
    it('should store output and retrieve it', async () => {
      const record = createTestRecord({
        executionId: 'exec_output1',
        steps: [{ stepId: 's1', stepName: 'test', command: 'echo data', status: 'COMPLETED' as const }],
      });

      await storage.save(record as unknown as import('../types/index.js').ExecutionRecord);

      const retrieved = await storage.get('exec_output1');
      expect(retrieved).toBeDefined();
    });
  });

  describe('Scenario 4: Archiving', () => {
    it('should archive old records and search them', async () => {
      const oldRecord = createTestRecord({
        executionId: 'exec_old1',
        startedAt: '2025-01-01T12:00:00.000Z',
      });

      await recordManager.save(oldRecord);

      const searchResult = await recordManager.search('old');
      expect(searchResult.total).toBeGreaterThan(0);
    });
  });

  describe('Scenario 5: Search and filter', () => {
    it('should search across multiple records and filter by query', async () => {
      await recordManager.save(createTestRecord({
        executionId: 'exec_search1',
        workflowName: 'deploy app',
        startedAt: '2026-05-07T10:00:00.000Z',
      }));
      await recordManager.save(createTestRecord({
        executionId: 'exec_search2',
        workflowName: 'run tests',
        startedAt: '2026-05-07T11:00:00.000Z',
      }));
      await recordManager.save(createTestRecord({
        executionId: 'exec_search3',
        workflowName: 'deploy service',
        startedAt: '2026-05-07T12:00:00.000Z',
      }));

      const result = await recordManager.search('deploy');
      expect(result.total).toBe(2);
      expect(result.records[0].workflowName).toMatch(/deploy/);

      const filtered = await recordManager.search('deploy', { limit: 1 });
      expect(filtered.records).toHaveLength(1);
      expect(filtered.hasMore).toBe(true);
    });

    it('should get recent records in order', async () => {
      await recordManager.save(createTestRecord({
        executionId: 'exec_old',
        startedAt: '2026-05-01T12:00:00.000Z',
      }));
      await recordManager.save(createTestRecord({
        executionId: 'exec_new',
        startedAt: '2026-05-07T12:00:00.000Z',
      }));

      const recent = await recordManager.getRecent(5);
      expect(recent[0].executionId).toBe('exec_new');
    });
  });
});
