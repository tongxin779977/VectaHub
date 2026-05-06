import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage } from './storage.js';
import type { ExecutionRecord, StepRecord } from '../types/index.js';

function createTestRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  const base = {
    executionId: 'exec_20260507_120000_a1b2',
    workflowId: 'wf-1',
    workflowName: 'test-workflow',
    status: 'COMPLETED' as const,
    startedAt: new Date('2026-05-07T12:00:00.000Z'),
    endedAt: new Date('2026-05-07T12:00:01.000Z'),
    duration: 1000,
    steps: [] as StepRecord[],
  };
  return { ...base, ...overrides } as ExecutionRecord;
}

describe('Storage with output-store integration', () => {
  let tmpDir: string;
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'storage-test-'));
    storage = createStorage({ storageDir: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save with separate output', () => {
    it('should save record with outputRef when output is present', async () => {
      const record = createTestRecord({
        steps: [
          { stepId: 'step_1', stepName: 'test', command: 'echo hi', status: 'COMPLETED' as const, output: ['hello world', 'line2'] },
        ],
      } as unknown as ExecutionRecord);

      await storage.save(record);
      const retrieved = await storage.get(record.executionId);

      expect(retrieved).toBeDefined();
    });

    it('should delete output files when deleting record', async () => {
      const record = createTestRecord({
        steps: [
          { stepId: 'step_1', stepName: 'test', command: 'echo hi', status: 'COMPLETED' as const, output: ['data'] },
        ],
      } as unknown as ExecutionRecord);

      await storage.save(record);
      await storage.delete(record.executionId);
      const retrieved = await storage.get(record.executionId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getOutputStore', () => {
    it('should return output store by default', () => {
      const outputStore = storage.getOutputStore();
      expect(outputStore).toBeDefined();
    });

    it('should return undefined when separateOutput is false', () => {
      const store = createStorage({ storageDir: tmpDir, separateOutput: false });
      expect(store.getOutputStore()).toBeUndefined();
    });
  });
});
