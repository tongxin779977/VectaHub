export type CheckpointType = 'git' | 'worktree' | 'worker_native';

export interface GitCheckpointReference {
  type: 'git';
  commitHash: string;
  ref?: string;
  hasUncommittedChanges: boolean;
}

export interface WorktreeCheckpointReference {
  type: 'worktree';
  snapshotId: string;
  path: string;
  createdAt: string;
}

export interface WorkerNativeCheckpointReference {
  type: 'worker_native';
  workerType: string;
  checkpointId: string;
  metadata: Record<string, string>;
}

export type CheckpointReference =
  | GitCheckpointReference
  | WorktreeCheckpointReference
  | WorkerNativeCheckpointReference;

export interface CheckpointAvailability {
  available: boolean;
  stale: boolean;
  reason?: string;
}
