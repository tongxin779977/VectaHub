import type {
  CheckpointReference,
  CheckpointAvailability,
  GitCheckpointReference,
  WorktreeCheckpointReference,
  WorkerNativeCheckpointReference,
} from '../types/index.js';
import path from 'path';
import fs from 'fs';

export function validateCheckpointReference(
  ref: unknown
): { valid: true; ref: CheckpointReference } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (!ref || typeof ref !== 'object') {
    return { valid: false, errors: ['Checkpoint reference must be an object'] };
  }

  const checkpointRef = ref as Record<string, unknown>;

  if (!['git', 'worktree', 'worker_native'].includes(checkpointRef.type as string)) {
    errors.push('Invalid checkpoint type');
  }

  switch (checkpointRef.type) {
    case 'git': {
      const gitRef = checkpointRef as Partial<GitCheckpointReference>;
      if (!gitRef.commitHash || gitRef.commitHash.length < 7) {
        errors.push('Git commit hash is required and must be at least 7 characters');
      }
      if (typeof gitRef.hasUncommittedChanges !== 'boolean') {
        errors.push('hasUncommittedChanges must be a boolean');
      }
      break;
    }
    case 'worktree': {
      const worktreeRef = checkpointRef as Partial<WorktreeCheckpointReference>;
      if (!worktreeRef.snapshotId) {
        errors.push('Worktree snapshotId is required');
      }
      if (!worktreeRef.path) {
        errors.push('Worktree path is required');
      }
      if (!worktreeRef.createdAt) {
        errors.push('Worktree createdAt is required');
      }
      break;
    }
    case 'worker_native': {
      const workerRef = checkpointRef as Partial<WorkerNativeCheckpointReference>;
      if (!workerRef.workerType) {
        errors.push('Worker type is required');
      }
      if (!workerRef.checkpointId) {
        errors.push('Worker checkpointId is required');
      }
      if (!workerRef.metadata || typeof workerRef.metadata !== 'object') {
        errors.push('Worker metadata must be an object');
      }
      break;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, ref: ref as CheckpointReference };
}

export async function checkGitCheckpointAvailability(
  _ref: GitCheckpointReference,
  _cwd: string
): Promise<CheckpointAvailability> {
  // For now, return a conservative default since we don't have git dependency
  // In future, can integrate git checks via child_process
  return {
    available: true,
    stale: false,
  };
}

export function checkWorktreeCheckpointAvailability(
  ref: WorktreeCheckpointReference,
  cwd: string
): CheckpointAvailability {
  const fullPath = path.isAbsolute(ref.path)
    ? ref.path
    : path.resolve(cwd, ref.path);

  const exists = fs.existsSync(fullPath);

  return {
    available: exists,
    stale: !exists,
    reason: exists ? undefined : `Worktree snapshot not found at ${fullPath}`,
  };
}

export function checkCheckpointAvailability(
  ref: CheckpointReference,
  cwd: string
): Promise<CheckpointAvailability> {
  switch (ref.type) {
    case 'git':
      return checkGitCheckpointAvailability(ref, cwd);
    case 'worktree':
      return Promise.resolve(checkWorktreeCheckpointAvailability(ref, cwd));
    case 'worker_native':
      // Worker native checkpoint availability is worker-specific,
      // default to conservative behavior for now
      return Promise.resolve({
        available: true,
        stale: false,
      });
  }
}
