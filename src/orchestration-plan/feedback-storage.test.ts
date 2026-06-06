import { describe, it, expect, beforeEach } from 'vitest';
import { createFeedbackStorage, createFeedbackRecord } from './feedback-storage.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Feedback Storage', () => {
  let environment: MockEnvironmentService;

  beforeEach(() => {
    environment = new MockEnvironmentService();
  });

  it('should create a feedback record', () => {
    const record = createFeedbackRecord(
      'user_correction',
      'test input',
      'plan: some decision',
      'rejected',
      'backlog'
    );

    expect(record.feedbackId).toBeDefined();
    expect(record.source).toBe('user_correction');
    expect(record.inputHash).toBeDefined();
    expect(record.plannerDecision).toBe('plan: some decision');
    expect(record.outcome).toBe('rejected');
    expect(record.appliedTo).toBe('backlog');
    expect(record.createdAt).toBeDefined();
  });

  it('should create feedback record with evidence and capability', () => {
    const record = createFeedbackRecord(
      'semantic_e2e',
      'another input',
      'tool: git status',
      'failed_execution',
      'eval',
      { traceId: 'trace-123', executionId: 'exec-456' },
      'nl'
    );

    expect(record.capability).toBe('nl');
    expect(record.evidence.traceId).toBe('trace-123');
    expect(record.evidence.executionId).toBe('exec-456');
  });

  it('should save and retrieve a feedback record', async () => {
    const storage = createFeedbackStorage({ environment, logger });
    const record = createFeedbackRecord(
      'user_correction',
      'test input',
      'plan: some decision',
      'rejected',
      'backlog'
    );

    await storage.saveFeedback(record);
    const retrieved = await storage.getFeedback(record.feedbackId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.feedbackId).toBe(record.feedbackId);
    expect(retrieved?.source).toBe(record.source);
    expect(retrieved?.outcome).toBe(record.outcome);
  });

  it('should return undefined for non-existent feedback', async () => {
    const storage = createFeedbackStorage({ environment, logger });
    const retrieved = await storage.getFeedback('non-existent-feedback');
    expect(retrieved).toBeUndefined();
  });

  it('should list all feedback in order', async () => {
    const storage = createFeedbackStorage({ environment, logger });

    const record1 = createFeedbackRecord('user_correction', 'input 1', 'dec 1', 'accepted', 'eval');
    (record1 as any).feedbackId = 'fb-1';
    (record1 as any).createdAt = '2024-01-01T00:00:00.000Z';

    const record2 = createFeedbackRecord('semantic_e2e', 'input 2', 'dec 2', 'failed_execution', 'prompt_proposal');
    (record2 as any).feedbackId = 'fb-2';
    (record2 as any).createdAt = '2024-01-02T00:00:00.000Z';

    await storage.saveFeedback(record1);
    await storage.saveFeedback(record2);

    const feedbacks = await storage.listFeedback();
    expect(feedbacks.length).toBe(2);
    expect(feedbacks[0].feedbackId).toBe(record2.feedbackId);
    expect(feedbacks[1].feedbackId).toBe(record1.feedbackId);
  });

  it('should list feedback with limit', async () => {
    const storage = createFeedbackStorage({ environment, logger });

    for (let i = 0; i < 5; i++) {
      const record = createFeedbackRecord('execution_result', `input ${i}`, `dec ${i}`, 'accepted', 'eval');
      await storage.saveFeedback(record);
    }

    const feedbacks = await storage.listFeedback(3);
    expect(feedbacks.length).toBe(3);
  });

  it('should list feedback by appliedTo', async () => {
    const storage = createFeedbackStorage({ environment, logger });

    const evalRecord = createFeedbackRecord('user_correction', 'input 1', 'dec 1', 'accepted', 'eval');
    const backlogRecord = createFeedbackRecord('semantic_e2e', 'input 2', 'dec 2', 'failed_execution', 'backlog');

    await storage.saveFeedback(evalRecord);
    await storage.saveFeedback(backlogRecord);

    const evalFeedbacks = await storage.listFeedbackByAppliedTo('eval');
    expect(evalFeedbacks.length).toBe(1);
    expect(evalFeedbacks[0].appliedTo).toBe('eval');

    const backlogFeedbacks = await storage.listFeedbackByAppliedTo('backlog');
    expect(backlogFeedbacks.length).toBe(1);
    expect(backlogFeedbacks[0].appliedTo).toBe('backlog');
  });

  it('should list feedback by source', async () => {
    const storage = createFeedbackStorage({ environment, logger });

    const userRecord = createFeedbackRecord('user_correction', 'input 1', 'dec 1', 'accepted', 'eval');
    const e2eRecord = createFeedbackRecord('semantic_e2e', 'input 2', 'dec 2', 'failed_execution', 'backlog');

    await storage.saveFeedback(userRecord);
    await storage.saveFeedback(e2eRecord);

    const userFeedbacks = await storage.listFeedbackBySource('user_correction');
    expect(userFeedbacks.length).toBe(1);
    expect(userFeedbacks[0].source).toBe('user_correction');

    const e2eFeedbacks = await storage.listFeedbackBySource('semantic_e2e');
    expect(e2eFeedbacks.length).toBe(1);
    expect(e2eFeedbacks[0].source).toBe('semantic_e2e');
  });

  it('should export replay candidates', async () => {
    const storage = createFeedbackStorage({ environment, logger });

    const record1 = createFeedbackRecord('user_correction', 'input 1', 'dec 1', 'accepted', 'eval');
    const record2 = createFeedbackRecord('semantic_e2e', 'input 2', 'dec 2', 'failed_execution', 'prompt_proposal');

    await storage.saveFeedback(record1);
    await storage.saveFeedback(record2);

    const allCandidates = await storage.exportReplayCandidates();
    expect(allCandidates.length).toBe(2);

    const evalCandidates = await storage.exportReplayCandidates('eval');
    expect(evalCandidates.length).toBe(1);
    expect(evalCandidates[0].appliedTo).toBe('eval');
  });

  it('should delete a feedback record', async () => {
    const storage = createFeedbackStorage({ environment, logger });
    const record = createFeedbackRecord('user_correction', 'input', 'dec', 'accepted', 'eval');

    await storage.saveFeedback(record);
    expect(await storage.getFeedback(record.feedbackId)).toBeDefined();

    await storage.deleteFeedback(record.feedbackId);
    expect(await storage.getFeedback(record.feedbackId)).toBeUndefined();
  });

  it('should handle empty feedback list', async () => {
    const storage = createFeedbackStorage({ environment, logger });
    const feedbacks = await storage.listFeedback();
    expect(feedbacks.length).toBe(0);
  });

  it('should not throw when deleting non-existent feedback', async () => {
    const storage = createFeedbackStorage({ environment, logger });
    await expect(storage.deleteFeedback('non-existent')).resolves.not.toThrow();
  });

  it('should redact sensitive info (placeholder for future)', async () => {
    const storage = createFeedbackStorage({ environment, logger });
    const record = createFeedbackRecord('user_correction', 'test input', 'dec', 'accepted', 'eval');

    await storage.saveFeedback(record);
    const retrieved = await storage.getFeedback(record.feedbackId);

    // 目前没有要脱敏的字段，这是一个占位测试
    expect(retrieved).toBeDefined();
  });

  it('should generate consistent input hash for same input', () => {
    const record1 = createFeedbackRecord('user_correction', 'same input', 'dec', 'accepted', 'eval');
    const record2 = createFeedbackRecord('semantic_e2e', 'same input', 'dec', 'accepted', 'eval');

    expect(record1.inputHash).toBe(record2.inputHash);
  });

  it('should generate different input hash for different inputs', () => {
    const record1 = createFeedbackRecord('user_correction', 'input A', 'dec', 'accepted', 'eval');
    const record2 = createFeedbackRecord('semantic_e2e', 'input B', 'dec', 'accepted', 'eval');

    expect(record1.inputHash).not.toBe(record2.inputHash);
  });
});
