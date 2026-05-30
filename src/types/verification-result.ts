import type { CommandInvocation } from './orchestration-plan.js';

export type OrchestrationVerificationStatus = 'pass' | 'fail' | 'blocked' | 'skipped';

export type OrchestrationVerificationFailureKind =
  | 'command_failure'
  | 'semantic_failure'
  | 'safety_blocked'
  | 'system_error';

export interface OrchestrationVerificationCommandResult {
  command: CommandInvocation;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdoutSummary?: string;
  stderrSummary?: string;
  outputTruncated?: boolean;
}

export interface OrchestrationVerificationSemanticResult {
  checkId: string;
  passed: boolean;
  description: string;
  failureReason?: string;
}

export interface OrchestrationVerificationResult {
  planId: string;
  status: OrchestrationVerificationStatus;
  failureKind?: OrchestrationVerificationFailureKind;
  failureReason?: string;
  commandResults: OrchestrationVerificationCommandResult[];
  semanticResults: OrchestrationVerificationSemanticResult[];
  allSuccessCriteriaMet: boolean;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}
