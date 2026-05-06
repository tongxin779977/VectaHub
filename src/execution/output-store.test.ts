import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOutputStore } from './output-store.js';

describe('OutputStore', () => {
  let tmpDir: string;
  let store: ReturnType<typeof createOutputStore>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'output-store-test-'));
    store = createOutputStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('should save stdout and return OutputReference', async () => {
      const ref = await store.save('exec_1', 'step_1', 'Hello stdout');
      expect(ref.stepId).toBe('step_1');
      expect(ref.stdoutPath).toBe('exec_1/step_1.stdout');
      expect(ref.summary).toBe('Hello stdout');
      expect(ref.lineCount).toBe(1);
    });

    it('should save both stdout and stderr when stderr provided', async () => {
      const ref = await store.save('exec_1', 'step_1', 'out', 'err');
      expect(ref.stderrPath).toBe('exec_1/step_1.stderr');
    });

    it('should include line count and byte size', async () => {
      const content = 'line1\nline2\nline3';
      const ref = await store.save('exec_1', 'step_1', content);
      expect(ref.lineCount).toBe(3);
      expect(ref.byteSize).toBe(Buffer.byteLength(content, 'utf-8'));
    });
  });

  describe('read', () => {
    it('should return both stdout and stderr after save', async () => {
      await store.save('exec_1', 'step_1', 'stdout content', 'stderr content');
      const result = await store.read('exec_1', 'step_1');
      expect(result.stdout).toBe('stdout content');
      expect(result.stderr).toBe('stderr content');
    });

    it('should return empty strings for non-existent output', async () => {
      const result = await store.read('exec_nonexistent', 'step_nonexistent');
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should return empty stderr when only stdout was saved', async () => {
      await store.save('exec_1', 'step_1', 'stdout only');
      const result = await store.read('exec_1', 'step_1');
      expect(result.stdout).toBe('stdout only');
      expect(result.stderr).toBe('');
    });
  });

  describe('getSummary', () => {
    it('should return truncated summary for long content', async () => {
      const longContent = 'x'.repeat(500);
      await store.save('exec_1', 'step_1', longContent);
      const summary = await store.getSummary('exec_1', 'step_1');
      expect(summary).not.toBeNull();
      expect(summary!.length).toBe(203);
      expect(summary!.endsWith('...')).toBe(true);
    });

    it('should return full content when under 200 chars', async () => {
      await store.save('exec_1', 'step_1', 'short output');
      const summary = await store.getSummary('exec_1', 'step_1');
      expect(summary).toBe('short output');
    });

    it('should return null for non-existent output', async () => {
      const summary = await store.getSummary('exec_missing', 'step_1');
      expect(summary).toBeNull();
    });
  });

  describe('getSize', () => {
    it('should return total size of all output files', async () => {
      await store.save('exec_1', 'step_1', 'abc', 'def');
      const size = await store.getSize('exec_1');
      expect(size).toBeGreaterThan(0);
    });

    it('should return 0 for non-existent execution', async () => {
      const size = await store.getSize('exec_missing');
      expect(size).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete all outputs for an execution', async () => {
      await store.save('exec_1', 'step_1', 'content1');
      await store.save('exec_1', 'step_2', 'content2');
      await store.delete('exec_1');

      expect(await store.has('exec_1', 'step_1')).toBe(false);
      expect(await store.has('exec_1', 'step_2')).toBe(false);
    });

    it('should not affect other executions when deleting one', async () => {
      await store.save('exec_1', 'step_1', 'content1');
      await store.save('exec_2', 'step_1', 'content2');

      await store.delete('exec_1');

      expect(await store.has('exec_1', 'step_1')).toBe(false);
      expect(await store.has('exec_2', 'step_1')).toBe(true);
    });
  });

  describe('has', () => {
    it('should return true after save', async () => {
      await store.save('exec_1', 'step_1', 'content');
      expect(await store.has('exec_1', 'step_1')).toBe(true);
    });

    it('should return false for non-existent output', async () => {
      expect(await store.has('exec_nonexistent', 'step_1')).toBe(false);
    });
  });
});
