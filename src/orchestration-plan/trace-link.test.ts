import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyPlan, planFromCapability } from './planner.js';
import { convertPlanToDraft } from './workflow-draft-converter.js';
import { createDraftStorage } from './draft-storage.js';
import type { OrchestrationTask } from '../types/index.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Trace Link Integration', () => {
  let environment: MockEnvironmentService;

  beforeEach(() => {
    environment = new MockEnvironmentService();
  });

  it('should maintain traceId from plan to draft', async () => {
    const testTraceId = 'trace-test-123';
    const testAuditEventIds = ['audit-event-1', 'audit-event-2'];

    // 1. 创建 plan 并关联 traceId
    const tasks: OrchestrationTask[] = [{
      id: 'task-1',
      kind: 'reply',
      title: 'Test Task',
      executor: 'local',
      dependsOn: [],
      inputs: [],
      outputs: [],
      sideEffect: 'none',
      confidence: 'high',
      needsConfirmation: false,
    }];

    const planResult = await planFromCapability('Test Goal', tasks, {
      cwd: '/test',
      source: 'manual',
      traceId: testTraceId,
      auditEventIds: testAuditEventIds,
    });

    expect(planResult.kind).toBe('plan');
    expect(planResult.plan?.trace?.traceId).toBe(testTraceId);
    expect(planResult.plan?.trace?.auditEventIds).toEqual(testAuditEventIds);

    if (!planResult.plan) {
      throw new Error('Plan should not be null');
    }

    // 2. 转换为 draft 并验证 trace 关联
    const draft = convertPlanToDraft(planResult.plan, {
      cwd: '/test',
    });

    expect(draft.trace?.traceId).toBe(testTraceId);
    expect(draft.trace?.planId).toBe(planResult.plan.planId);
    expect(draft.trace?.auditEventIds).toEqual(testAuditEventIds);
    expect(draft.planId).toBe(planResult.plan.planId);

    // 3. 保存和读取 draft 并验证 trace 保持
    const draftStorage = createDraftStorage({
      environment,
      logger,
    });

    await draftStorage.saveDraft(draft);
    const loadedDraft = await draftStorage.getDraft(draft.draftId);

    expect(loadedDraft).toBeDefined();
    expect(loadedDraft?.trace?.traceId).toBe(testTraceId);
    expect(loadedDraft?.trace?.planId).toBe(planResult.plan.planId);

    // 4. 验证类型定义正确
    expect(typeof draft.trace?.traceId).toBe('string');
    expect(typeof draft.planId).toBe('string');
  });

  it('should create a unique traceId if none is provided', () => {
    const plan = createEmptyPlan({
      cwd: '/test',
      source: 'manual',
    });

    expect(plan.trace).toBeDefined();
    expect(plan.trace?.traceId).toBeDefined();
    expect(typeof plan.trace?.traceId).toBe('string');
  });
});
