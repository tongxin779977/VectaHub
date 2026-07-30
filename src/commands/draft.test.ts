import { describe, it, expect, beforeEach } from 'vitest';
import { createDraftStorage } from '../orchestration-plan/draft-storage.js';
import { convertPlanToDraft } from '../orchestration-plan/workflow-draft-converter.js';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';

const testLogger = pino({ level: 'silent' });

function createTestPlan(overrides?: Partial<OrchestrationPlan>): OrchestrationPlan {
  const plan: OrchestrationPlan = {
    schemaVersion: '1.0',
    planId: 'test-plan-123',
    goal: 'Test goal',
    source: 'run',
    mode: 'strict',
    tasks: [
      {
        id: 'task-1',
        kind: 'apply',
        executor: 'local',
        title: 'Test task',
        description: 'Do something',
        dependsOn: [],
        sideEffect: 'read',
        command: {
          cli: 'echo',
          args: ['hello'],
        },
      },
    ],
    safetyReview: {
      status: 'safe',
      findings: [],
    },
    verification: {
      required: false,
      commands: [],
      successCriteria: [],
    },
    ...overrides,
  };
  return plan;
}

describe('Draft CLI Commands', () => {
  describe('draft storage operations', () => {
    let environment: MockEnvironmentService;

    beforeEach(() => {
      environment = new MockEnvironmentService();
    });

    it('should save and retrieve a draft', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });
      const plan = createTestPlan();
      const draft = convertPlanToDraft(plan);

      await storage.saveDraft(draft);
      const retrieved = await storage.getDraft(draft.draftId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.draftId).toBe(draft.draftId);
      expect(retrieved?.planId).toBe(draft.planId);
    });

    it('should return undefined for non-existent draft', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });
      const retrieved = await storage.getDraft('non-existent-draft');
      expect(retrieved).toBeUndefined();
    });

    it('should list drafts from storage', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });

      const plan = createTestPlan();
      const draft = convertPlanToDraft(plan);
      await storage.saveDraft(draft);

      const drafts = await storage.listDrafts();
      expect(drafts.length).toBe(1);
      expect(drafts[0].draftId).toBe(draft.draftId);
    });

    it('should get draft by id', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });

      const plan = createTestPlan();
      const draft = convertPlanToDraft(plan);
      await storage.saveDraft(draft);

      const retrieved = await storage.getDraft(draft.draftId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.draftId).toBe(draft.draftId);
    });

    it('should delete draft', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });

      const plan = createTestPlan();
      const draft = convertPlanToDraft(plan);
      await storage.saveDraft(draft);

      await storage.deleteDraft(draft.draftId);
      const retrieved = await storage.getDraft(draft.draftId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('draft status flow', () => {
    let environment: MockEnvironmentService;

    beforeEach(() => {
      environment = new MockEnvironmentService();
    });

    it('should handle needs_confirmation status', async () => {
      const plan = createTestPlan({
        safetyReview: {
          status: 'needs_confirmation',
          findings: [
            {
              level: 'high',
              category: 'filesystem',
              reason: 'This task will modify files',
              requiredAction: 'confirm',
            },
          ],
        },
      });
      const draft = convertPlanToDraft(plan);

      expect(draft.status).toBe('needs_confirmation');
      expect(draft.safetyReview.status).toBe('needs_confirmation');
      expect(draft.safetyReview.findings.length).toBe(1);
    });

    it('should handle blocked status', async () => {
      const plan = createTestPlan({
        safetyReview: {
          status: 'blocked',
          findings: [
            {
              level: 'critical',
              category: 'filesystem',
              reason: 'This task is too dangerous',
              requiredAction: 'block',
            },
          ],
        },
      });
      const draft = convertPlanToDraft(plan);

      expect(draft.safetyReview.status).toBe('blocked');
      expect(draft.safetyReview.findings[0].level).toBe('critical');
    });
  });

  describe('draft confirmation flow', () => {
    let environment: MockEnvironmentService;

    beforeEach(() => {
      environment = new MockEnvironmentService();
    });

    it('should handle confirming a draft', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });

      const plan = createTestPlan({
        safetyReview: {
          status: 'needs_confirmation',
          findings: [
            {
              level: 'high',
              category: 'filesystem',
              reason: 'This task will modify files',
              requiredAction: 'confirm',
            },
          ],
        },
      });
      const draft = convertPlanToDraft(plan);
      await storage.saveDraft(draft);

      draft.confirmation = {
        confirmedAt: new Date().toISOString(),
        confirmedBy: 'user',
        confirmedTaskIds: draft.steps.map(s => s.sourceTaskId),
        deniedTaskIds: [],
      };
      draft.status = 'confirmed';

      await storage.saveDraft(draft);

      const retrieved = await storage.getDraft(draft.draftId);
      expect(retrieved?.status).toBe('confirmed');
      expect(retrieved?.confirmation).toBeDefined();
      expect(retrieved?.confirmation?.confirmedBy).toBe('user');
    });

    it('should handle denying a draft', async () => {
      const storage = createDraftStorage({ environment, logger: testLogger });

      const plan = createTestPlan();
      const draft = convertPlanToDraft(plan);
      await storage.saveDraft(draft);

      draft.confirmation = {
        confirmedAt: new Date().toISOString(),
        confirmedBy: 'user',
        confirmedTaskIds: [],
        deniedTaskIds: draft.steps.map(s => s.sourceTaskId),
      };
      draft.status = 'cancelled';

      await storage.saveDraft(draft);

      const retrieved = await storage.getDraft(draft.draftId);
      expect(retrieved?.status).toBe('cancelled');
      expect(retrieved?.confirmation?.deniedTaskIds.length).toBeGreaterThan(0);
    });
  });

  describe('draft safety review', () => {
    it('should handle various safety findings', async () => {
      const plan = createTestPlan({
        safetyReview: {
          status: 'needs_confirmation',
          findings: [
            {
              stepId: 'task-1',
              level: 'critical',
              category: 'network',
              reason: 'This task will make network requests',
              requiredAction: 'block',
            },
            {
              stepId: 'task-2',
              level: 'high',
              category: 'filesystem',
              reason: 'This task will delete files',
              requiredAction: 'confirm',
            },
            {
              level: 'low',
              category: 'command',
              reason: 'This is a read-only command',
              requiredAction: 'allow',
            },
          ],
        },
      });

      const draft = convertPlanToDraft(plan);
      expect(draft.safetyReview.findings.length).toBe(3);
      expect(draft.safetyReview.findings.filter(f => f.requiredAction === 'block').length).toBe(1);
      expect(draft.safetyReview.findings.filter(f => f.requiredAction === 'confirm').length).toBe(1);
      expect(draft.safetyReview.findings.filter(f => f.requiredAction === 'allow').length).toBe(1);
    });
  });

  describe('draft step types', () => {
    it('should handle exec step type', async () => {
      const plan = createTestPlan({
        tasks: [
          {
            id: 'task-1',
            kind: 'apply',
            executor: 'local',
            title: 'Run npm install',
            description: 'Install dependencies',
            dependsOn: [],
            sideEffect: 'command',
            command: {
              cli: 'npm',
              args: ['install'],
            },
          },
        ],
      });

      const draft = convertPlanToDraft(plan);
      expect(draft.steps[0].type).toBe('exec');
      expect(draft.steps[0].command?.cli).toBe('npm');
      expect(draft.steps[0].command?.args).toEqual(['install']);
    });

    it('should handle delegate step type', async () => {
      const plan = createTestPlan({
        tasks: [
          {
            id: 'task-1',
            kind: 'apply',
            executor: 'agent',
            delegateTo: 'codex',
            title: 'Let codex fix this',
            description: 'Codex should fix the issue',
            dependsOn: [],
            sideEffect: 'write',
          },
        ],
      });

      const draft = convertPlanToDraft(plan);
      expect(draft.steps[0].type).toBe('delegate');
      expect(draft.steps[0].delegate?.to).toBe('codex');
    });
  });

  describe('draft verification', () => {
    it('should handle verification required', async () => {
      const plan = createTestPlan({
        verification: {
          required: true,
          commands: [
            { cli: 'npm', args: ['run', 'test'] },
          ],
          successCriteria: ['All tests pass'],
        },
      });

      const draft = convertPlanToDraft(plan);
      expect(draft.verification.required).toBe(true);
      expect(draft.verification.commands.length).toBe(1);
      expect(draft.verification.successCriteria.length).toBe(1);
    });
  });
});
