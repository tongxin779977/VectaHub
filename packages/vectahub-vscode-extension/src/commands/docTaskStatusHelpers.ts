import type { AgentTaskContractSummary } from '../project/docTaskContract.js';
import type { DocTaskFailureKind, DocTaskRunStatus } from '../project/docTaskState.js';

export function resolveVerificationStatus(
  changedFiles: string[],
  verification?: {
    ok: boolean;
    isSystemError?: boolean;
  },
  agentExecutionOutcome?: 'implemented' | 'planned_only',
): { status: DocTaskRunStatus; failureKind?: DocTaskFailureKind } {
  if (agentExecutionOutcome === 'planned_only') {
    return { status: 'ready' };
  }
  if (verification?.isSystemError) {
    return { status: 'failed_system_internal', failureKind: 'system_internal' };
  }
  if (verification && !verification.ok) {
    return { status: 'failed_test', failureKind: 'test' };
  }
  const status: DocTaskRunStatus = changedFiles.length > 0 ? 'changed' : 'success';
  return { status };
}

export function persistContractHashFromCliResult(
  runRecord: { instructionHash?: string } | undefined,
  summary?: AgentTaskContractSummary,
): void {
  if (!runRecord) return;
  runRecord.instructionHash = summary?.instructionHash ?? runRecord.instructionHash;
}
