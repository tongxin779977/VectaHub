import { describe, it, expect, vi } from 'vitest';
import {
  validateCheckpointReference,
  checkGitCheckpointAvailability,
  checkWorktreeCheckpointAvailability,
  checkCheckpointAvailability,
} from './checkpoint-reference-validator.js';
import type {
  GitCheckpointReference,
  WorktreeCheckpointReference,
  WorkerNativeCheckpointReference,
} from '../types/index.js';
import fs from 'fs';

// Mock fs
vi.mock('fs');

describe('Checkpoint Reference Validator', () => {
  describe('validateCheckpointReference', () => {
    it('should validate a valid git checkpoint reference', () => {
      const gitRef: GitCheckpointReference = {
        type: 'git',
        commitHash: 'a1b2c3d',
        hasUncommittedChanges: false,
      };
      const result = validateCheckpointReference(gitRef);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.ref).toEqual(gitRef);
      }
    });

    it('should validate a valid worktree checkpoint reference', () => {
      const worktreeRef: WorktreeCheckpointReference = {
        type: 'worktree',
        snapshotId: 'snap-123',
        path: '/tmp/snapshot',
        createdAt: '2024-01-01T00:00:00Z',
      };
      const result = validateCheckpointReference(worktreeRef);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.ref).toEqual(worktreeRef);
      }
    });

    it('should validate a valid worker native checkpoint reference', () => {
      const workerRef: WorkerNativeCheckpointReference = {
        type: 'worker_native',
        workerType: 'codex',
        checkpointId: 'chk-456',
        metadata: {},
      };
      const result = validateCheckpointReference(workerRef);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.ref).toEqual(workerRef);
      }
    });

    it('should reject invalid checkpoint type', () => {
      const invalidRef = {
        type: 'invalid_type',
      };
      const result = validateCheckpointReference(invalidRef);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('Invalid checkpoint type');
      }
    });

    it('should reject git checkpoint with too short hash', () => {
      const invalidGitRef = {
        type: 'git',
        commitHash: 'abc',
        hasUncommittedChanges: false,
      };
      const result = validateCheckpointReference(invalidGitRef);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('Git commit hash is required and must be at least 7 characters');
      }
    });
  });

  describe('checkWorktreeCheckpointAvailability', () => {
    it('should return available when worktree path exists', () => {
      const existsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const worktreeRef: WorktreeCheckpointReference = {
        type: 'worktree',
        snapshotId: 'snap-123',
        path: '/tmp/snapshot',
        createdAt: '2024-01-01T00:00:00Z',
      };
      const result = checkWorktreeCheckpointAvailability(worktreeRef, '/test');
      expect(result.available).toBe(true);
      expect(result.stale).toBe(false);
      existsSync.mockRestore();
    });

    it('should return not available when worktree path does not exist', () => {
      const existsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const worktreeRef: WorktreeCheckpointReference = {
        type: 'worktree',
        snapshotId: 'snap-123',
        path: '/tmp/snapshot',
        createdAt: '2024-01-01T00:00:00Z',
      };
      const result = checkWorktreeCheckpointAvailability(worktreeRef, '/test');
      expect(result.available).toBe(false);
      expect(result.stale).toBe(true);
      expect(result.reason).toContain('Worktree snapshot not found');
      existsSync.mockRestore();
    });
  });

  describe('checkCheckpointAvailability', () => {
    it('should dispatch to correct checker based on type', async () => {
      const workerRef: WorkerNativeCheckpointReference = {
        type: 'worker_native',
        workerType: 'codex',
        checkpointId: 'chk-456',
        metadata: {},
      };
      const result = await checkCheckpointAvailability(workerRef, '/test');
      expect(result.available).toBe(true);
      expect(result.stale).toBe(false);
    });
  });
});
