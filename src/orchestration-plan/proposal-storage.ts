import type {
  ProposalRecord,
  ProposalType,
  ProposalStatus,
  ProposalContent,
  ProposalReview,
  ProposalEvidence,
  ProposalListOptions,
  ProposalReport,
} from '../types/proposal.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';
import type { NLFeedbackRecord } from '../types/feedback.js';
import * as crypto from 'crypto';

export interface ProposalStorageOptions {
  storageDir?: string;
  environment: IEnvironmentService;
  logger: pino.Logger;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isNotFoundError(error: unknown): boolean {
  if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isNotFoundError((error as { cause: unknown }).cause);
  }
  if (error instanceof Error && (
    error.message.includes('File not found') ||
    error.message.includes('ENOENT')
  )) {
    return true;
  }
  return false;
}

function parseJsonObject(content: string, source: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${source}: ${message}`, { cause: error });
  }
}

function ensureDir(dir: string, environment: IEnvironmentService): void {
  environment.ensureDir(dir);
}

function generateProposalId(): string {
  return `prop-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

export function createProposalRecord(
  type: ProposalType,
  content: ProposalContent,
  source: 'feedback' | 'audit' | 'manual',
  evidence: ProposalEvidence,
  sourceFeedbackId?: string
): ProposalRecord {
  const now = new Date().toISOString();
  return {
    proposalId: generateProposalId(),
    type,
    source,
    sourceFeedbackId,
    content,
    status: 'pending_review',
    evidence,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProposalFromFeedback(
  feedback: NLFeedbackRecord,
  type: ProposalType,
  content: ProposalContent
): ProposalRecord {
  return createProposalRecord(
    type,
    content,
    'feedback',
    {
      feedbackId: feedback.feedbackId,
      traceId: feedback.evidence.traceId,
      executionId: feedback.evidence.executionId,
      testCaseId: feedback.evidence.testCaseId,
    },
    feedback.feedbackId
  );
}

export function createEvalCandidateProposal(
  feedback: NLFeedbackRecord,
  _testCaseContent: {
    input: string;
    expectedIntent?: string;
    expectedSafety?: string;
    notes?: string;
  }
): ProposalRecord {
  const content: ProposalContent = {
    title: `Eval Case from Feedback ${feedback.feedbackId}`,
    description: `Test case derived from feedback`,
    rationale: `Source: ${feedback.source}, Outcome: ${feedback.outcome}`,
    impact: 'Adds to regression test suite',
  };

  return createProposalRecord(
    'eval',
    content,
    'feedback',
    {
      feedbackId: feedback.feedbackId,
      traceId: feedback.evidence.traceId,
      testCaseId: feedback.evidence.testCaseId,
    },
    feedback.feedbackId
  );
}

export function createPromptProposal(
  feedback: NLFeedbackRecord,
  promptSuggestion: {
    target: string;
    currentPrompt?: string;
    suggestedChange: string;
    reason: string;
  }
): ProposalRecord {
  const content: ProposalContent = {
    title: `Prompt Improvement from Feedback ${feedback.feedbackId}`,
    description: `Prompt improvement suggestion`,
    rationale: promptSuggestion.reason,
    targetScope: promptSuggestion.target,
    impact: 'May improve LLM planning quality',
  };

  return createProposalRecord(
    'prompt_proposal',
    content,
    'feedback',
    {
      feedbackId: feedback.feedbackId,
      traceId: feedback.evidence.traceId,
    },
    feedback.feedbackId
  );
}

export function createRuleProposal(
  feedback: NLFeedbackRecord,
  ruleSuggestion: {
    ruleName: string;
    currentBehavior: string;
    suggestedBehavior: string;
    reason: string;
    risk?: string;
  }
): ProposalRecord {
  const content: ProposalContent = {
    title: `Rule Change from Feedback ${feedback.feedbackId}`,
    description: `Security or validation rule improvement suggestion`,
    rationale: ruleSuggestion.reason,
    targetScope: ruleSuggestion.ruleName,
    impact: ruleSuggestion.risk ? `Risk: ${ruleSuggestion.risk}` : 'May improve safety or validation',
  };

  return createProposalRecord(
    'rule_proposal',
    content,
    'feedback',
    {
      feedbackId: feedback.feedbackId,
      traceId: feedback.evidence.traceId,
    },
    feedback.feedbackId
  );
}

export function createProposalStorage(options: ProposalStorageOptions) {
  const { environment, logger } = options;
  const storageDir = options.storageDir || environment.getHomePath();
  const proposalsDir = environment.joinPath(storageDir, 'proposals');

  function ensureProposalsDir(): void {
    ensureDir(proposalsDir, environment);
  }

  async function saveProposal(record: ProposalRecord): Promise<void> {
    ensureProposalsDir();
    const filePath = environment.joinPath(proposalsDir, `${record.proposalId}.json`);
    const redactedRecord = redactProposal(record);
    environment.writeFile(filePath, JSON.stringify(redactedRecord, null, 2));
    logger.debug({ proposalId: record.proposalId }, 'Proposal record saved');
  }

  function redactProposal(record: ProposalRecord): ProposalRecord {
    const redacted: ProposalRecord = JSON.parse(JSON.stringify(record));
    return redacted;
  }

  function restoreProposalFromData(data: Record<string, unknown>): ProposalRecord {
    return data as unknown as ProposalRecord;
  }

  async function getProposal(proposalId: string): Promise<ProposalRecord | undefined> {
    const filePath = environment.joinPath(proposalsDir, `${proposalId}.json`);
    try {
      const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
      return restoreProposalFromData(data);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function listProposals(options?: ProposalListOptions): Promise<ProposalRecord[]> {
    try {
      const files = environment.readDir(proposalsDir);
      let proposals = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const filePath = environment.joinPath(proposalsDir, f);
          const data = parseJsonObject(environment.readFile(filePath), filePath);
          return restoreProposalFromData(data);
        });

      if (options?.type) {
        proposals = proposals.filter(p => p.type === options.type);
      }
      if (options?.status) {
        proposals = proposals.filter(p => p.status === options.status);
      }

      const sorted = proposals.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      if (options?.offset) {
        proposals = sorted.slice(options.offset);
      }
      if (options?.limit) {
        proposals = proposals.slice(0, options.limit);
      }

      return proposals;
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  async function reviewProposal(
    proposalId: string,
    decision: 'approved' | 'rejected',
    reviewer?: string,
    reason?: string
  ): Promise<ProposalRecord | undefined> {
    const proposal = await getProposal(proposalId);
    if (!proposal) {
      return undefined;
    }

    const review: ProposalReview = {
      reviewedAt: new Date().toISOString(),
      reviewer,
      decision,
      reason,
    };

    proposal.review = review;
    proposal.status = 'reviewed';
    proposal.updatedAt = new Date().toISOString();
    await saveProposal(proposal);
    return proposal;
  }

  async function applyProposal(proposalId: string): Promise<ProposalRecord | undefined> {
    const proposal = await getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (!proposal.review || proposal.review.decision !== 'approved') {
      throw new Error(`Proposal ${proposalId} must be approved before applying`);
    }

    proposal.status = 'applied';
    proposal.updatedAt = new Date().toISOString();
    await saveProposal(proposal);
    return proposal;
  }

  async function rejectProposal(proposalId: string, _reason?: string): Promise<ProposalRecord | undefined> {
    const proposal = await getProposal(proposalId);
    if (!proposal) {
      return undefined;
    }

    proposal.status = 'rejected';
    proposal.updatedAt = new Date().toISOString();
    await saveProposal(proposal);
    return proposal;
  }

  async function generateReport(): Promise<ProposalReport> {
    const proposals = await listProposals();
    const now = new Date().toISOString();

    const byStatus: Record<ProposalStatus, number> = {
      pending_review: 0,
      reviewed: 0,
      applied: 0,
      rejected: 0,
    };
    const byType: Record<ProposalType, number> = {
      eval: 0,
      prompt_proposal: 0,
      rule_proposal: 0,
    };

    for (const p of proposals) {
      byStatus[p.status]++;
      byType[p.type]++;
    }

    return {
      generatedAt: now,
      totalProposals: proposals.length,
      byStatus,
      byType,
      proposals: proposals.map(p => ({
        proposalId: p.proposalId,
        type: p.type,
        status: p.status,
        content: p.content,
        createdAt: p.createdAt,
      })),
      pendingReview: byStatus.pending_review,
      needsAttention: byStatus.pending_review > 10,
    };
  }

  async function exportEvalCandidates(limit: number = 100): Promise<Array<{
    proposalId: string;
    title: string;
    description: string;
    rationale: string;
    evidence: ProposalEvidence;
  }>> {
    const evalProposals = await listProposals({ type: 'eval', status: 'pending_review' });
    return evalProposals.slice(0, limit).map(p => ({
      proposalId: p.proposalId,
      title: p.content.title,
      description: p.content.description,
      rationale: p.content.rationale,
      evidence: p.evidence,
    }));
  }

  async function exportPromptProposals(limit: number = 50): Promise<Array<{
    proposalId: string;
    title: string;
    targetScope?: string;
    description: string;
    rationale: string;
    evidence: ProposalEvidence;
  }>> {
    const proposals = await listProposals({ type: 'prompt_proposal', status: 'pending_review' });
    return proposals.slice(0, limit).map(p => ({
      proposalId: p.proposalId,
      title: p.content.title,
      targetScope: p.content.targetScope,
      description: p.content.description,
      rationale: p.content.rationale,
      evidence: p.evidence,
    }));
  }

  async function exportRuleProposals(limit: number = 50): Promise<Array<{
    proposalId: string;
    title: string;
    targetScope?: string;
    description: string;
    rationale: string;
    impact?: string;
    evidence: ProposalEvidence;
  }>> {
    const proposals = await listProposals({ type: 'rule_proposal', status: 'pending_review' });
    return proposals.slice(0, limit).map(p => ({
      proposalId: p.proposalId,
      title: p.content.title,
      targetScope: p.content.targetScope,
      description: p.content.description,
      rationale: p.content.rationale,
      impact: p.content.impact,
      evidence: p.evidence,
    }));
  }

  async function exportAllProposals(
    appliedTo?: ProposalType,
    limit: number = 100
  ): Promise<ProposalRecord[]> {
    const options: ProposalListOptions = { limit };
    if (appliedTo) {
      options.type = appliedTo;
    }
    return listProposals(options);
  }

  async function deleteProposal(proposalId: string): Promise<void> {
    const filePath = environment.joinPath(proposalsDir, `${proposalId}.json`);
    try {
      environment.rm(filePath);
      logger.debug({ proposalId }, 'Proposal record deleted');
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return {
    saveProposal,
    getProposal,
    listProposals,
    reviewProposal,
    applyProposal,
    rejectProposal,
    generateReport,
    exportEvalCandidates,
    exportPromptProposals,
    exportRuleProposals,
    exportAllProposals,
    deleteProposal,
    createProposalRecord,
    createProposalFromFeedback,
    createEvalCandidateProposal,
    createPromptProposal,
    createRuleProposal,
  };
}
