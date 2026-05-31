export type ProposalType = 'eval' | 'prompt_proposal' | 'rule_proposal';

export type ProposalStatus = 'pending_review' | 'reviewed' | 'applied' | 'rejected';

export interface ProposalEvidence {
  feedbackId?: string;
  traceId?: string;
  executionId?: string;
  testCaseId?: string;
}

export interface ProposalReview {
  reviewedAt: string;
  reviewer?: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

export interface ProposalContent {
  title: string;
  description: string;
  rationale: string;
  targetScope?: string;
  impact?: string;
}

export interface ProposalRecord {
  proposalId: string;
  type: ProposalType;
  source: 'feedback' | 'audit' | 'manual';
  sourceFeedbackId?: string;
  content: ProposalContent;
  status: ProposalStatus;
  review?: ProposalReview;
  evidence: ProposalEvidence;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalListOptions {
  type?: ProposalType;
  status?: ProposalStatus;
  limit?: number;
  offset?: number;
}

export interface ProposalReport {
  generatedAt: string;
  totalProposals: number;
  byStatus: Record<ProposalStatus, number>;
  byType: Record<ProposalType, number>;
  proposals: Array<{
    proposalId: string;
    type: ProposalType;
    status: ProposalStatus;
    content: ProposalContent;
    createdAt: string;
  }>;
  pendingReview: number;
  needsAttention: boolean;
}
