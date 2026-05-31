import type { WorkerResult, WorkerChangedFile, WorkerArtifact, WorkerResultStatus, WorkerFailureKind } from '../types/worker-result.js';

const MAX_SUMMARY_LENGTH = 2000;
const MAX_DIFF_SUMMARY_LENGTH = 500;
const MAX_ARTIFACT_SUMMARY_LENGTH = 500;
const MAX_CHANGED_FILES = 100;
const MAX_ARTIFACTS = 50;

export interface RawWorkerOutput {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs: number;
  gitChanges?: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
}

export function normalizeWorkerResult(
  workerId: string,
  rawOutput: RawWorkerOutput,
  verificationRequired: boolean = true
): WorkerResult {
  // Determine status and failure kind
  let status: WorkerResultStatus;
  let failureKind: WorkerFailureKind | undefined;
  let failureReason: string | undefined;

  if (rawOutput.exitCode === undefined) {
    status = 'cancelled';
    failureKind = 'internal_error';
    failureReason = 'Worker execution was cancelled or did not complete';
  } else if (rawOutput.exitCode !== 0) {
    status = 'failure';
    failureKind = 'command_failure';
    failureReason = rawOutput.stderr ? truncate(rawOutput.stderr, MAX_SUMMARY_LENGTH) : 'Worker command failed with non-zero exit code';
  } else {
    status = 'success';
  }

  // Generate summary
  let summary = '';
  if (status === 'success') {
    summary = truncate(rawOutput.stdout || 'Worker completed successfully', MAX_SUMMARY_LENGTH);
  } else {
    summary = failureReason || 'Worker failed';
  }

  // Normalize changed files
  const changedFiles: WorkerChangedFile[] = [];
  if (rawOutput.gitChanges) {
    for (const path of rawOutput.gitChanges.added.slice(0, MAX_CHANGED_FILES)) {
      changedFiles.push({ path, status: 'added' });
    }
    for (const path of rawOutput.gitChanges.modified.slice(0, MAX_CHANGED_FILES)) {
      changedFiles.push({ path, status: 'modified' });
    }
    for (const path of rawOutput.gitChanges.deleted.slice(0, MAX_CHANGED_FILES)) {
      changedFiles.push({ path, status: 'deleted' });
    }
  }

  // No artifacts by default - this will be extended later
  const artifacts: WorkerArtifact[] = [];

  return {
    schemaVersion: '1.0',
    workerId,
    status,
    summary,
    exitCode: rawOutput.exitCode,
    failureKind,
    failureReason,
    changedFiles,
    artifacts,
    executionTimeMs: rawOutput.executionTimeMs,
    redacted: true,
    verificationRequired
  };
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
