import type {
  CommandInvocation,
  SideEffectLevel,
  OrchestrationDelegateTarget,
} from './orchestration-plan.js';

export type WorkflowDraftStatus =
  | 'draft'
  | 'reviewed'
  | 'needs_confirmation'
  | 'confirmed'
  | 'persisted'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'recoverable'
  | 'archived';

export type WorkflowDraftSource = 'run' | 'chat' | 'document' | 'manual';

export type WorkflowDraftStepType = 'exec' | 'if' | 'for_each' | 'parallel' | 'opencli' | 'delegate';

export type WorkflowDraftDelegateTarget = OrchestrationDelegateTarget;

export type DraftSafetyReviewStatus = 'not_reviewed' | 'safe' | 'needs_confirmation' | 'blocked';

export type DraftSafetyFindingCategory = 'filesystem' | 'network' | 'command' | 'agent' | 'data' | 'unknown';

export type DraftSafetyFindingAction = 'allow' | 'confirm' | 'block';

export interface DraftSafetyFinding {
  stepId?: string;
  level: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  category: DraftSafetyFindingCategory;
  reason: string;
  requiredAction: DraftSafetyFindingAction;
}

export interface DraftSafetyReview {
  status: DraftSafetyReviewStatus;
  findings: DraftSafetyFinding[];
}

export interface DraftConfirmation {
  confirmedAt: string;
  confirmedBy: 'user' | 'non_interactive_policy';
  confirmedTaskIds: string[];
  deniedTaskIds: string[];
}

export interface WorkflowDraftSnapshot {
  planHash: string;
  workflowHash: string;
  generatedAt: string;
  sourceCwd: string;
}

export interface DraftVerification {
  required: boolean;
  commands: CommandInvocation[];
  successCriteria: string[];
}

export interface WorkflowDraftTraceLink {
  traceId?: string;
  planId: string;
  executionId?: string;
  auditEventIds: string[];
}

export interface WorkflowDraftMetadata {
  createdAt: string;
  createdFrom: WorkflowDraftSource;
  cwd: string;
  dryRunAvailable: boolean;
  persistRequested: boolean;
}

export interface WorkflowDraftStep {
  id: string;
  sourceTaskId: string;
  type: WorkflowDraftStepType;
  label: string;
  dependsOn: string[];
  command?: CommandInvocation;
  delegate?: {
    to: WorkflowDraftDelegateTarget;
    prompt: string;
  };
  outputVar?: string;
  artifactOutputs?: string[];
  sideEffect: SideEffectLevel;
}

export interface WorkflowDraft {
  schemaVersion: '1.0';
  draftId: string;
  planId: string;
  status: WorkflowDraftStatus;
  name: string;
  mode: 'strict' | 'relaxed' | 'consensus';
  steps: WorkflowDraftStep[];
  safetyReview: DraftSafetyReview;
  confirmation?: DraftConfirmation;
  snapshot: WorkflowDraftSnapshot;
  verification: DraftVerification;
  trace?: WorkflowDraftTraceLink;
  metadata: WorkflowDraftMetadata;
}
