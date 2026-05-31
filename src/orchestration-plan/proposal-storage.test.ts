import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProposalStorage,
  createProposalRecord,
  createProposalFromFeedback,
  createEvalCandidateProposal,
  createPromptProposal,
  createRuleProposal,
} from './proposal-storage.js';
import type { NLFeedbackRecord } from '../types/feedback.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function createMockFeedback(overrides?: Partial<NLFeedbackRecord>): NLFeedbackRecord {
  return {
    feedbackId: 'fb-test-123',
    source: 'user_correction',
    inputHash: 'abc123',
    plannerDecision: 'test decision',
    outcome: 'needs_review',
    evidence: {
      traceId: 'trace-123',
      executionId: 'exec-456',
    },
    appliedTo: 'eval',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Proposal Storage', () => {
  let environment: MockEnvironmentService;

  beforeEach(() => {
    environment = new MockEnvironmentService();
  });

  describe('createProposalRecord', () => {
    it('should create a basic proposal record', () => {
      const proposal = createProposalRecord(
        'eval',
        {
          title: 'Test Proposal',
          description: 'A test proposal',
          rationale: 'Testing purposes',
        },
        'manual',
        { traceId: 'trace-1' }
      );

      expect(proposal.proposalId).toBeDefined();
      expect(proposal.proposalId.startsWith('prop-')).toBe(true);
      expect(proposal.type).toBe('eval');
      expect(proposal.status).toBe('pending_review');
      expect(proposal.source).toBe('manual');
      expect(proposal.content.title).toBe('Test Proposal');
      expect(proposal.createdAt).toBeDefined();
      expect(proposal.updatedAt).toBeDefined();
    });

    it('should create proposal with all proposal types', () => {
      const evalProposal = createProposalRecord('eval', {
        title: 'Eval',
        description: 'Eval proposal',
        rationale: 'test',
      }, 'manual', {});
      expect(evalProposal.type).toBe('eval');

      const promptProposal = createProposalRecord('prompt_proposal', {
        title: 'Prompt',
        description: 'Prompt proposal',
        rationale: 'test',
      }, 'manual', {});
      expect(promptProposal.type).toBe('prompt_proposal');

      const ruleProposal = createProposalRecord('rule_proposal', {
        title: 'Rule',
        description: 'Rule proposal',
        rationale: 'test',
      }, 'manual', {});
      expect(ruleProposal.type).toBe('rule_proposal');
    });
  });

  describe('createProposalFromFeedback', () => {
    it('should create proposal from feedback', () => {
      const feedback = createMockFeedback();
      const proposal = createProposalFromFeedback(feedback, 'eval', {
        title: 'From Feedback',
        description: 'Derived from feedback',
        rationale: 'Based on feedback',
      });

      expect(proposal.source).toBe('feedback');
      expect(proposal.sourceFeedbackId).toBe('fb-test-123');
      expect(proposal.evidence.feedbackId).toBe('fb-test-123');
      expect(proposal.evidence.traceId).toBe('trace-123');
    });
  });

  describe('createEvalCandidateProposal', () => {
    it('should create eval candidate from feedback', () => {
      const feedback = createMockFeedback();
      const proposal = createEvalCandidateProposal(feedback, {
        input: 'test input',
        expectedIntent: 'git_status',
        notes: 'test case',
      });

      expect(proposal.type).toBe('eval');
      expect(proposal.sourceFeedbackId).toBe('fb-test-123');
      expect(proposal.content.description).toBe('Test case derived from feedback');
      expect(proposal.status).toBe('pending_review');
    });
  });

  describe('createPromptProposal', () => {
    it('should create prompt proposal from feedback', () => {
      const feedback = createMockFeedback();
      const proposal = createPromptProposal(feedback, {
        target: 'planner prompt',
        currentPrompt: 'old prompt',
        suggestedChange: 'new prompt',
        reason: 'improves clarity',
      });

      expect(proposal.type).toBe('prompt_proposal');
      expect(proposal.content.targetScope).toBe('planner prompt');
      expect(proposal.content.rationale).toBe('improves clarity');
    });
  });

  describe('createRuleProposal', () => {
    it('should create rule proposal from feedback', () => {
      const feedback = createMockFeedback();
      const proposal = createRuleProposal(feedback, {
        ruleName: 'shell_safety',
        currentBehavior: 'allow all',
        suggestedBehavior: 'block dangerous',
        reason: 'improves safety',
        risk: 'low',
      });

      expect(proposal.type).toBe('rule_proposal');
      expect(proposal.content.targetScope).toBe('shell_safety');
      expect(proposal.content.impact).toContain('Risk: low');
    });
  });

  describe('saveProposal and getProposal', () => {
    it('should save and retrieve a proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', {
        title: 'Test',
        description: 'Test proposal',
        rationale: 'Testing',
      }, 'manual', { traceId: 'trace-1' });

      await storage.saveProposal(proposal);
      const retrieved = await storage.getProposal(proposal.proposalId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.proposalId).toBe(proposal.proposalId);
      expect(retrieved?.type).toBe('eval');
      expect(retrieved?.content.title).toBe('Test');
    });

    it('should return undefined for non-existent proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const retrieved = await storage.getProposal('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listProposals', () => {
    it('should list all proposals', async () => {
      const storage = createProposalStorage({ environment, logger });

      const p1 = createProposalRecord('eval', { title: 'P1', description: 'd1', rationale: 'r1' }, 'manual', {});
      const p2 = createProposalRecord('prompt_proposal', { title: 'P2', description: 'd2', rationale: 'r2' }, 'manual', {});
      const p3 = createProposalRecord('rule_proposal', { title: 'P3', description: 'd3', rationale: 'r3' }, 'manual', {});

      await storage.saveProposal(p1);
      await storage.saveProposal(p2);
      await storage.saveProposal(p3);

      const proposals = await storage.listProposals();
      expect(proposals.length).toBe(3);
    });

    it('should filter by type', async () => {
      const storage = createProposalStorage({ environment, logger });

      const evalProposal = createProposalRecord('eval', { title: 'E', description: 'd', rationale: 'r' }, 'manual', {});
      const promptProposal = createProposalRecord('prompt_proposal', { title: 'P', description: 'd', rationale: 'r' }, 'manual', {});

      await storage.saveProposal(evalProposal);
      await storage.saveProposal(promptProposal);

      const evalProposals = await storage.listProposals({ type: 'eval' });
      expect(evalProposals.length).toBe(1);
      expect(evalProposals[0].type).toBe('eval');
    });

    it('should filter by status', async () => {
      const storage = createProposalStorage({ environment, logger });

      const pending = createProposalRecord('eval', { title: 'P', description: 'd', rationale: 'r' }, 'manual', {});
      const reviewed = createProposalRecord('eval', { title: 'R', description: 'd', rationale: 'r' }, 'manual', {});
      (reviewed as any).status = 'reviewed';

      await storage.saveProposal(pending);
      await storage.saveProposal(reviewed);

      const pendingProposals = await storage.listProposals({ status: 'pending_review' });
      expect(pendingProposals.length).toBe(1);
    });

    it('should apply limit', async () => {
      const storage = createProposalStorage({ environment, logger });

      for (let i = 0; i < 5; i++) {
        const p = createProposalRecord('eval', { title: `P${i}`, description: 'd', rationale: 'r' }, 'manual', {});
        await storage.saveProposal(p);
      }

      const limited = await storage.listProposals({ limit: 3 });
      expect(limited.length).toBe(3);
    });
  });

  describe('reviewProposal', () => {
    it('should review a proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);

      const reviewed = await storage.reviewProposal(proposal.proposalId, 'approved', 'tester', 'looks good');
      expect(reviewed).toBeDefined();
      expect(reviewed?.review?.decision).toBe('approved');
      expect(reviewed?.review?.reviewer).toBe('tester');
      expect(reviewed?.status).toBe('reviewed');
    });

    it('should reject a proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);

      const rejected = await storage.reviewProposal(proposal.proposalId, 'rejected', 'tester', 'not needed');
      expect(rejected?.review?.decision).toBe('rejected');
      expect(rejected?.status).toBe('reviewed');
    });

    it('should return undefined for non-existent proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const result = await storage.reviewProposal('non-existent', 'approved');
      expect(result).toBeUndefined();
    });
  });

  describe('applyProposal', () => {
    it('should apply an approved proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);
      await storage.reviewProposal(proposal.proposalId, 'approved');

      const applied = await storage.applyProposal(proposal.proposalId);
      expect(applied?.status).toBe('applied');
    });

    it('should throw when applying non-approved proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);

      await expect(storage.applyProposal(proposal.proposalId)).rejects.toThrow();
    });

    it('should throw when applying non-existent proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      await expect(storage.applyProposal('non-existent')).rejects.toThrow();
    });
  });

  describe('rejectProposal', () => {
    it('should reject a proposal directly', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);

      const rejected = await storage.rejectProposal(proposal.proposalId, 'not applicable');
      expect(rejected?.status).toBe('rejected');
    });
  });

  describe('generateReport', () => {
    it('should generate proposal report', async () => {
      const storage = createProposalStorage({ environment, logger });

      const p1 = createProposalRecord('eval', { title: 'E1', description: 'd', rationale: 'r' }, 'manual', {});
      const p2 = createProposalRecord('prompt_proposal', { title: 'P1', description: 'd', rationale: 'r' }, 'manual', {});
      const p3 = createProposalRecord('rule_proposal', { title: 'R1', description: 'd', rationale: 'r' }, 'manual', {});

      await storage.saveProposal(p1);
      await storage.saveProposal(p2);
      await storage.saveProposal(p3);

      const report = await storage.generateReport();

      expect(report.totalProposals).toBe(3);
      expect(report.byType.eval).toBe(1);
      expect(report.byType.prompt_proposal).toBe(1);
      expect(report.byType.rule_proposal).toBe(1);
      expect(report.pendingReview).toBe(3);
      expect(report.needsAttention).toBe(false);
      expect(report.proposals.length).toBe(3);
    });

    it('should flag needsAttention when pending review exceeds threshold', async () => {
      const storage = createProposalStorage({ environment, logger });

      for (let i = 0; i < 15; i++) {
        const p = createProposalRecord('eval', { title: `P${i}`, description: 'd', rationale: 'r' }, 'manual', {});
        await storage.saveProposal(p);
      }

      const report = await storage.generateReport();
      expect(report.pendingReview).toBe(15);
      expect(report.needsAttention).toBe(true);
    });
  });

  describe('exportEvalCandidates', () => {
    it('should export eval candidates', async () => {
      const storage = createProposalStorage({ environment, logger });

      const eval1 = createProposalRecord('eval', { title: 'E1', description: 'd', rationale: 'r' }, 'manual', {});
      const eval2 = createProposalRecord('eval', { title: 'E2', description: 'd', rationale: 'r' }, 'manual', {});
      const prompt = createProposalRecord('prompt_proposal', { title: 'P1', description: 'd', rationale: 'r' }, 'manual', {});

      await storage.saveProposal(eval1);
      await storage.saveProposal(eval2);
      await storage.saveProposal(prompt);

      const candidates = await storage.exportEvalCandidates();
      expect(candidates.length).toBe(2);
      expect(candidates.every(c => c.description === 'd')).toBe(true);
    });

    it('should respect limit', async () => {
      const storage = createProposalStorage({ environment, logger });

      for (let i = 0; i < 10; i++) {
        const p = createProposalRecord('eval', { title: `E${i}`, description: 'd', rationale: 'r' }, 'manual', {});
        await storage.saveProposal(p);
      }

      const candidates = await storage.exportEvalCandidates(5);
      expect(candidates.length).toBe(5);
    });
  });

  describe('exportPromptProposals', () => {
    it('should export prompt proposals', async () => {
      const storage = createProposalStorage({ environment, logger });

      const prompt1 = createProposalRecord('prompt_proposal', { title: 'P1', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(prompt1);

      const proposals = await storage.exportPromptProposals();
      expect(proposals.length).toBe(1);
      expect(proposals[0].title).toBe('P1');
    });
  });

  describe('exportRuleProposals', () => {
    it('should export rule proposals', async () => {
      const storage = createProposalStorage({ environment, logger });

      const rule1 = createProposalRecord('rule_proposal', {
        title: 'R1',
        description: 'd',
        rationale: 'r',
        impact: 'improves safety',
      }, 'manual', {});
      await storage.saveProposal(rule1);

      const proposals = await storage.exportRuleProposals();
      expect(proposals.length).toBe(1);
      expect(proposals[0].title).toBe('R1');
    });
  });

  describe('deleteProposal', () => {
    it('should delete a proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);

      expect(await storage.getProposal(proposal.proposalId)).toBeDefined();
      await storage.deleteProposal(proposal.proposalId);
      expect(await storage.getProposal(proposal.proposalId)).toBeUndefined();
    });

    it('should not throw when deleting non-existent proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      await expect(storage.deleteProposal('non-existent')).resolves.not.toThrow();
    });
  });

  describe('governance boundary', () => {
    it('should not allow applying proposal without review', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);

      await expect(storage.applyProposal(proposal.proposalId)).rejects.toThrow('must be approved');
    });

    it('should not allow applying rejected proposal', async () => {
      const storage = createProposalStorage({ environment, logger });
      const proposal = createProposalRecord('eval', { title: 'T', description: 'd', rationale: 'r' }, 'manual', {});
      await storage.saveProposal(proposal);
      await storage.reviewProposal(proposal.proposalId, 'rejected');

      await expect(storage.applyProposal(proposal.proposalId)).rejects.toThrow('must be approved');
    });
  });
});
