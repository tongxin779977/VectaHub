import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage } from './storage.js';
import type { ExecutionRecord, StepRecord } from '../types/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';
import { MockLoggerService } from '../infrastructure/testing/mock-services.js';

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
    const logger = new MockLoggerService().getLogger('storage');
    storage = createStorage({ storageDir: tmpDir, environment: createEnvironmentService(tmpDir), logger });
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
      const logger = new MockLoggerService().getLogger('storage');
      const store = createStorage({ storageDir: tmpDir, separateOutput: false, environment: createEnvironmentService(tmpDir), logger });
      expect(store.getOutputStore()).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw on malformed execution record JSON', async () => {
      const broken = join(tmpDir, 'executions', 'broken.json');
      const fs = await import('node:fs/promises');
      await fs.mkdir(join(tmpDir, 'executions'), { recursive: true });
      await fs.writeFile(broken, '{bad json', 'utf-8');

      await expect(storage.get('broken')).rejects.toThrow();
    });

    it('should fail when output file is missing even if outputSummary exists', async () => {
      const fs = await import('node:fs/promises');
      const record = createTestRecord({
        steps: [
          {
            stepId: 'step_1',
            stepName: 'test',
            command: 'echo hi',
            status: 'COMPLETED' as const,
            output: ['hello summary fallback'],
          },
        ],
      } as unknown as ExecutionRecord);

      await storage.save(record);

      const stdoutPath = join(tmpDir, 'outputs', record.executionId, 'step_1.stdout');
      await fs.unlink(stdoutPath);

      await expect(storage.get(record.executionId)).rejects.toThrow(
        `Execution output artifact is missing for ${record.executionId}/step_1: ${record.executionId}/step_1.stdout`,
      );
    });

    it('should fail when outputSummary exists but outputRef is missing', async () => {
      const fs = await import('node:fs/promises');
      const record = createTestRecord({
        steps: [
          {
            stepId: 'step_1',
            stepName: 'test',
            command: 'echo hi',
            status: 'COMPLETED' as const,
            output: ['hello summary fallback'],
          },
        ],
      } as unknown as ExecutionRecord);

      await storage.save(record);

      const storedPath = join(tmpDir, 'executions', `${record.executionId}.json`);
      const stored = JSON.parse(await fs.readFile(storedPath, 'utf-8')) as ExecutionRecord & {
        steps: Array<Record<string, unknown>>;
      };
      delete stored.steps[0].outputRef;
      await fs.writeFile(storedPath, JSON.stringify(stored, null, 2), 'utf-8');

      await expect(storage.get(record.executionId)).rejects.toThrow(
        `Execution output metadata is corrupted for ${record.executionId}/step_1: outputRef is missing`,
      );
    });

    it('should throw on malformed execution record JSON during list', async () => {
      const broken = join(tmpDir, 'executions', 'broken-list.json');
      const fs = await import('node:fs/promises');
      await fs.mkdir(join(tmpDir, 'executions'), { recursive: true });
      await fs.writeFile(broken, '{bad json', 'utf-8');

      await expect(storage.list()).rejects.toThrow();
    });

    it('should return null when workflow file is missing from loadWorkflowFromFile', async () => {
      await expect(storage.loadWorkflowFromFile(join(tmpDir, 'missing-workflow.yaml'))).resolves.toBeNull();
    });

    it('should assign generated id to workflow loaded from YAML file without id', async () => {
      const fs = await import('node:fs/promises');
      const yamlPath = join(tmpDir, 'no-id-workflow.yaml');
      await fs.writeFile(yamlPath, [
        'name: test-no-id',
        'steps:',
        '  - id: step1',
        '    type: exec',
        '    cli: echo',
        '    args: ["hello"]',
      ].join('\n'), 'utf-8');

      const workflow = await storage.loadWorkflowFromFile(yamlPath);
      expect(workflow).not.toBeNull();
      expect(workflow!.id).toBeDefined();
      expect(workflow!.id).toMatch(/^wf_file_/);
      expect(workflow!.name).toBe('test-no-id');
    });

    it('should preserve existing id in workflow loaded from YAML file', async () => {
      const fs = await import('node:fs/promises');
      const yamlPath = join(tmpDir, 'with-id-workflow.yaml');
      await fs.writeFile(yamlPath, [
        'id: wf_custom_42',
        'name: test-with-id',
        'steps:',
        '  - id: step1',
        '    type: exec',
        '    cli: echo',
        '    args: ["hello"]',
      ].join('\n'), 'utf-8');

      const workflow = await storage.loadWorkflowFromFile(yamlPath);
      expect(workflow).not.toBeNull();
      expect(workflow!.id).toBe('wf_custom_42');
    });
  });
});
