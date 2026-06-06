import { describe, it, expect } from 'vitest';
import { normalizeWorkerResult } from './worker-result-normalizer.js';

describe('worker-result-normalizer', () => {
  describe('normalizeWorkerResult', () => {
    it('should normalize a successful worker result', () => {
      const rawOutput = {
        stdout: 'Successfully completed task',
        exitCode: 0,
        executionTimeMs: 1234,
        gitChanges: {
          added: ['src/new-file.ts'],
          modified: ['src/existing-file.ts'],
          deleted: []
        }
      };

      const result = normalizeWorkerResult('codex', rawOutput);

      expect(result.schemaVersion).toBe('1.0');
      expect(result.workerId).toBe('codex');
      expect(result.status).toBe('success');
      expect(result.summary).toBe('Successfully completed task');
      expect(result.exitCode).toBe(0);
      expect(result.executionTimeMs).toBe(1234);
      expect(result.redacted).toBe(true);
      expect(result.verificationRequired).toBe(true);
      expect(result.changedFiles).toEqual([
        { path: 'src/new-file.ts', status: 'added' },
        { path: 'src/existing-file.ts', status: 'modified' }
      ]);
      expect(result.artifacts).toEqual([]);
    });

    it('should normalize a failed worker result', () => {
      const rawOutput = {
        stdout: '',
        stderr: 'Error: Something went wrong',
        exitCode: 1,
        executionTimeMs: 567
      };

      const result = normalizeWorkerResult('claude', rawOutput);

      expect(result.status).toBe('failure');
      expect(result.failureKind).toBe('command_failure');
      expect(result.failureReason).toBe('Error: Something went wrong');
      expect(result.exitCode).toBe(1);
    });

    it('should normalize a cancelled worker result (no exit code)', () => {
      const rawOutput = {
        stdout: '',
        stderr: '',
        executionTimeMs: 100
      };

      const result = normalizeWorkerResult('gemini', rawOutput);

      expect(result.status).toBe('cancelled');
      expect(result.failureKind).toBe('internal_error');
    });

    it('should truncate long summary', () => {
      const longStdout = 'a'.repeat(3000);
      const rawOutput = {
        stdout: longStdout,
        exitCode: 0,
        executionTimeMs: 1000
      };

      const result = normalizeWorkerResult('codex', rawOutput);

      expect(result.summary.length).toBeLessThan(2001);
      expect(result.summary.endsWith('...')).toBe(true);
    });

    it('should limit number of changed files', () => {
      const manyFiles = Array.from({ length: 150 }, (_, i) => `src/file-${i}.ts`);
      const rawOutput = {
        stdout: '',
        exitCode: 0,
        executionTimeMs: 1000,
        gitChanges: {
          added: manyFiles,
          modified: [],
          deleted: []
        }
      };

      const result = normalizeWorkerResult('codex', rawOutput);

      expect(result.changedFiles.length).toBe(100);
    });
  });
});
