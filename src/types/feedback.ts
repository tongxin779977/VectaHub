export type FeedbackSource =
  | 'user_correction'
  | 'semantic_e2e'
  | 'execution_result'
  | 'safety_review'
  | 'recovery_result';

export type FeedbackOutcome =
  | 'accepted'
  | 'rejected'
  | 'failed_validation'
  | 'failed_execution'
  | 'needs_review';

export type FeedbackAppliedTo =
  | 'eval'
  | 'prompt_proposal'
  | 'rule_proposal'
  | 'catalog_gap'
  | 'backlog';

export interface FeedbackEvidence {
  traceId?: string;
  executionId?: string;
  testCaseId?: string;
}

export interface NLFeedbackRecord {
  feedbackId: string;
  source: FeedbackSource;
  inputHash: string;
  capability?: string;
  plannerDecision: string;
  outcome: FeedbackOutcome;
  evidence: FeedbackEvidence;
  appliedTo: FeedbackAppliedTo;
  createdAt: string;
}
