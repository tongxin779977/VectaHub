import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSampleStore, createRuntimeSample, type RuntimeSampleStoreDeps } from './run-task-runtime-sample-store.js';

const TEST_PROFILE = {
  agentId: 'test-agent',
  workspaceHash: 'test-workspace',
};

function createSample(overrides: Partial<ReturnType<typeof createRuntimeSample>> = {}): ReturnType<typeof createRuntimeSample> {
  return {
    profileKey: TEST_PROFILE,
    taskShapeHash: 'test-hash',
    complexity: 'small',
    score: 40,
    actualDurationMs: 300000,
    success: true,
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('run-task-runtime-sample-store', () => {
  describe('createRuntimeSample', () => {
    it('creates a sample with default values', () => {
      const sample = createRuntimeSample(TEST_PROFILE, 'hash', 'tiny', 10, 60000, true);
      expect(sample.profileKey).toEqual(TEST_PROFILE);
      expect(sample.taskShapeHash).toEqual('hash');
      expect(sample.complexity).toEqual('tiny');
      expect(sample.score).toEqual(10);
      expect(sample.actualDurationMs).toEqual(60000);
      expect(sample.success).toEqual(true);
      expect(sample.recordedAt).toBeDefined();
    });

    it('includes optional fields when provided', () => {
      const sample = createRuntimeSample(
        TEST_PROFILE,
        'hash',
        'small',
        40,
        300000,
        false,
        {
          failureKind: 'timeout',
          completionSignal: 'timeout',
        }
      );
      expect(sample.failureKind).toEqual('timeout');
      expect(sample.completionSignal).toEqual('timeout');
    });
  });

  describe('createRuntimeSampleStore', () => {
    it('can append and load samples', async () => {
      const inMemory: Record<string, string> = {};
      const deps: RuntimeSampleStoreDeps = {
        resolvePath: (...segments) => segments.join('/'),
        ensureDir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockImplementation(async (path: string) => inMemory[path] || ''),
        writeFile: vi.fn().mockImplementation(async (path: string, data: string) => {
          inMemory[path] = data;
        }),
      };

      const store = createRuntimeSampleStore(deps);
      const sample1 = createSample();
      const sample2 = createSample({ actualDurationMs: 360000 });

      await store.append(sample1);
      await store.append(sample2);

      const loaded = await store.load(TEST_PROFILE);
      expect(loaded.length).toEqual(2);
      expect(loaded[0].actualDurationMs).toEqual(360000);
      expect(loaded[1].actualDurationMs).toEqual(300000);
    });

    it('truncates to max 100 samples', async () => {
      const inMemory: Record<string, string> = {};
      const deps: RuntimeSampleStoreDeps = {
        resolvePath: (...segments) => segments.join('/'),
        ensureDir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockImplementation(async (path: string) => inMemory[path] || ''),
        writeFile: vi.fn().mockImplementation(async (path: string, data: string) => {
          inMemory[path] = data;
        }),
      };

      const store = createRuntimeSampleStore(deps);
      for (let i = 0; i < 150; i++) {
        await store.append(createSample({ actualDurationMs: 60000 + i * 1000 }));
      }

      const loaded = await store.load(TEST_PROFILE);
      expect(loaded.length).toEqual(100);
      expect(loaded[0].actualDurationMs).toEqual(60000 + 149 * 1000);
      expect(loaded[99].actualDurationMs).toEqual(60000 + 50 * 1000);
    });

    it('returns empty array when no file exists', async () => {
      const deps: RuntimeSampleStoreDeps = {
        resolvePath: (...segments) => segments.join('/'),
        ensureDir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockRejectedValue(new Error('not found')),
        writeFile: vi.fn().mockResolvedValue(undefined),
      };

      const store = createRuntimeSampleStore(deps);
      const loaded = await store.load(TEST_PROFILE);
      expect(loaded).toEqual([]);
    });

    it('separates samples by agent and workspace', async () => {
      const inMemory: Record<string, string> = {};
      const deps: RuntimeSampleStoreDeps = {
        resolvePath: (...segments) => segments.join('/'),
        ensureDir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockImplementation(async (path: string) => inMemory[path] || ''),
        writeFile: vi.fn().mockImplementation(async (path: string, data: string) => {
          inMemory[path] = data;
        }),
      };

      const store = createRuntimeSampleStore(deps);
      await store.append(createSample({ actualDurationMs: 100000 }));
      await store.append(createSample({
        profileKey: { agentId: 'other-agent', workspaceHash: 'test-workspace' },
        actualDurationMs: 200000,
      }));
      await store.append(createSample({
        profileKey: { agentId: 'test-agent', workspaceHash: 'other-workspace' },
        actualDurationMs: 300000,
      }));

      const loaded1 = await store.load({ agentId: 'test-agent', workspaceHash: 'test-workspace' });
      const loaded2 = await store.load({ agentId: 'other-agent', workspaceHash: 'test-workspace' });
      const loaded3 = await store.load({ agentId: 'test-agent', workspaceHash: 'other-workspace' });

      expect(loaded1.length).toEqual(1);
      expect(loaded1[0].actualDurationMs).toEqual(100000);
      expect(loaded2.length).toEqual(1);
      expect(loaded2[0].actualDurationMs).toEqual(200000);
      expect(loaded3.length).toEqual(1);
      expect(loaded3[0].actualDurationMs).toEqual(300000);
    });
  });
});
