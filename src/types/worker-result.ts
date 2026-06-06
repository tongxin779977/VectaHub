export type WorkerResultStatus = 'success' | 'failure' | 'cancelled' | 'needs_review';

export type WorkerFailureKind = 'command_failure' | 'timeout' | 'validation_failure' | 'security_blocked' | 'internal_error' | 'unknown';

export interface WorkerChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  diffSummary?: string;
}

export interface WorkerArtifact {
  id: string;
  type: string;
  path?: string;
  summary: string;
  hash?: string;
}

export interface WorkerResult {
  schemaVersion: '1.0';
  workerId: string;
  status: WorkerResultStatus;
  summary: string;
  exitCode?: number;
  failureKind?: WorkerFailureKind;
  failureReason?: string;
  changedFiles: WorkerChangedFile[];
  artifacts: WorkerArtifact[];
  executionTimeMs: number;
  redacted: boolean;
  verificationRequired: boolean;
}
