import { describe, it, expect, beforeEach } from 'vitest';
import { createDraftStorage } from './draft-storage.js';
import { convertPlanToDraft } from './workflow-draft-converter.js';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Draft Storage', () => {
  let environment: MockEnvironmentService;

  beforeEach(() => {
    environment = new MockEnvironmentService();
  });

  function createTestPlan(): OrchestrationPlan {
    return {
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
    };
  }

  it('should save and retrieve a draft', async () => {
    const storage = createDraftStorage({ environment, logger });
    const plan = createTestPlan();
    const draft = convertPlanToDraft(plan);

    await storage.saveDraft(draft);
    const retrieved = await storage.getDraft(draft.draftId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.draftId).toBe(draft.draftId);
    expect(retrieved?.planId).toBe(draft.planId);
  });

  it('should return undefined for non-existent draft', async () => {
    const storage = createDraftStorage({ environment, logger });
    const retrieved = await storage.getDraft('non-existent-draft');
    expect(retrieved).toBeUndefined();
  });

  it('should list all drafts in order', async () => {
    const storage = createDraftStorage({ environment, logger });
    
    const plan1 = createTestPlan();
    const draft1 = convertPlanToDraft(plan1);
    (draft1 as any).draftId = 'draft-1';
    (draft1 as any).metadata.createdAt = '2024-01-01T00:00:00.000Z';
    
    const plan2 = createTestPlan();
    const draft2 = convertPlanToDraft(plan2);
    (draft2 as any).draftId = 'draft-2';
    (draft2 as any).metadata.createdAt = '2024-01-02T00:00:00.000Z';

    await storage.saveDraft(draft1);
    await storage.saveDraft(draft2);

    const drafts = await storage.listDrafts();
    expect(drafts.length).toBe(2);
    expect(drafts[0].draftId).toBe(draft2.draftId);
    expect(drafts[1].draftId).toBe(draft1.draftId);
  });

  it('should list drafts by plan id', async () => {
    const storage = createDraftStorage({ environment, logger });
    
    const plan1 = createTestPlan();
    const draft1 = convertPlanToDraft(plan1);
    // 确保 draftId 是唯一的
    (draft1 as any).draftId = 'draft-1';
    
    const plan2 = createTestPlan();
    plan2.planId = 'different-plan-456';
    const draft2 = convertPlanToDraft(plan2);
    (draft2 as any).draftId = 'draft-2';

    await storage.saveDraft(draft1);
    await storage.saveDraft(draft2);

    // 先列出所有的 draft 检查一下
    const allDrafts = await storage.listDrafts();
    expect(allDrafts.length).toBe(2);

    const drafts = await storage.listDraftsByPlanId('test-plan-123');
    expect(drafts.length).toBe(1);
    expect(drafts[0].draftId).toBe(draft1.draftId);
  });

  it('should delete a draft', async () => {
    const storage = createDraftStorage({ environment, logger });
    const plan = createTestPlan();
    const draft = convertPlanToDraft(plan);

    await storage.saveDraft(draft);
    expect(await storage.getDraft(draft.draftId)).toBeDefined();

    await storage.deleteDraft(draft.draftId);
    expect(await storage.getDraft(draft.draftId)).toBeUndefined();
  });

  it('should update a draft', async () => {
    const storage = createDraftStorage({ environment, logger });
    const plan = createTestPlan();
    const draft = convertPlanToDraft(plan);

    await storage.saveDraft(draft);
    
    const updated = await storage.updateDraft(draft.draftId, {
      status: 'confirmed',
    });

    expect(updated).toBeDefined();
    expect(updated?.status).toBe('confirmed');

    const retrieved = await storage.getDraft(draft.draftId);
    expect(retrieved?.status).toBe('confirmed');
  });

  it('should return undefined when updating non-existent draft', async () => {
    const storage = createDraftStorage({ environment, logger });
    const updated = await storage.updateDraft('non-existent', { status: 'confirmed' });
    expect(updated).toBeUndefined();
  });

  it('should persist draft metadata correctly', async () => {
    const storage = createDraftStorage({ environment, logger });
    const plan = createTestPlan();
    const draft = convertPlanToDraft(plan, {
      cwd: '/test/path',
      dryRun: true,
    });

    await storage.saveDraft(draft);
    const retrieved = await storage.getDraft(draft.draftId);

    expect(retrieved?.metadata.cwd).toBe('/test/path');
    expect(retrieved?.metadata.dryRunAvailable).toBe(true);
  });

  it('should redact sensitive info (placeholder for future)', async () => {
    const storage = createDraftStorage({ environment, logger });
    const plan = createTestPlan();
    const draft = convertPlanToDraft(plan);

    await storage.saveDraft(draft);
    const retrieved = await storage.getDraft(draft.draftId);

    // 目前没有要脱敏的字段，这是一个占位测试
    expect(retrieved).toBeDefined();
  });

  it('should handle empty draft list', async () => {
    const storage = createDraftStorage({ environment, logger });
    const drafts = await storage.listDrafts();
    expect(drafts.length).toBe(0);
  });

  it('should not throw when deleting non-existent draft', async () => {
    const storage = createDraftStorage({ environment, logger });
    await expect(storage.deleteDraft('non-existent')).resolves.not.toThrow();
  });
});
