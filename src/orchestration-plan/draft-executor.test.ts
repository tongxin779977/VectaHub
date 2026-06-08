import { describe, expect, it, vi } from 'vitest';

vi.mock('../infrastructure/logger/index.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createConsoleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  isLoggerMuted: vi.fn(() => false),
  setMuted: vi.fn(),
}));

import { createDraftExecutor } from './draft-executor.js';
import { createTestInfrastructureContext } from '../infrastructure/testing/index.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';
import type { WorkflowEngine } from '../workflow/engine.js';
import type { ExecutionRecord } from '../types/workflow.js';

function createConfirmedDraft(): WorkflowDraft {
  return {
    schemaVersion: '1.0',
    draftId: 'draft-001',
    planId: 'plan-001',
    status: 'confirmed',
    name: 'Confirmed Draft',
    mode: 'strict',
    steps: [
      {
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: 'Run tests',
        dependsOn: [],
        command: {
          cli: 'npm',
          args: ['test'],
        },
        sideEffect: 'command',
      },
    ],
    safetyReview: {
      status: 'safe',
      findings: [],
    },
    confirmation: {
      confirmedAt: '2026-06-08T00:00:00.000Z',
      confirmedBy: 'user',
      confirmedTaskIds: ['task-1'],
      deniedTaskIds: [],
    },
    snapshot: {
      planHash: 'plan-hash',
      workflowHash: 'workflow-hash',
      generatedAt: '2026-06-08T00:00:00.000Z',
      sourceCwd: '/repo',
    },
    verification: {
      required: false,
      commands: [],
      successCriteria: [],
    },
    trace: {
      traceId: 'trace-001',
      planId: 'plan-001',
      auditEventIds: ['audit-1'],
    },
    metadata: {
      createdAt: '2026-06-08T00:00:00.000Z',
      createdFrom: 'manual',
      cwd: '/repo',
      dryRunAvailable: true,
      persistRequested: false,
    },
  };
}

function createExecutionRecord(): ExecutionRecord {
  return {
    executionId: 'exec-001',
    workflowId: 'workflow-001',
    workflowName: 'Confirmed Draft',
    status: 'COMPLETED',
    mode: 'strict',
    startedAt: new Date('2026-06-08T00:00:00.000Z'),
    endedAt: new Date('2026-06-08T00:00:01.000Z'),
    duration: 1000,
    steps: [],
    warnings: [],
    logs: [],
  };
}

describe('draft-executor', () => {
  it('should execute a confirmed draft and attach trace metadata', async () => {
    const context = createTestInfrastructureContext();
    const execute = vi.fn<WorkflowEngine['execute']>().mockResolvedValue(createExecutionRecord());
    const workflowEngine = {
      execute,
    } as unknown as WorkflowEngine;

    const executor = createDraftExecutor({
      context,
      workflowEngine,
    });

    const result = await executor.executeConfirmedDraft(createConfirmedDraft());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.executionRecord.planId).toBe('plan-001');
    expect(result.executionRecord.draftId).toBe('draft-001');
    expect(result.executionRecord.traceId).toBe('trace-001');
    expect(result.executionRecord.workflowHash).toBeTruthy();
  });

  it('should reject drafts that are not executable', async () => {
    const context = createTestInfrastructureContext();
    const workflowEngine = {
      execute: vi.fn(),
    } as unknown as WorkflowEngine;
    const executor = createDraftExecutor({
      context,
      workflowEngine,
    });

    const draft = createConfirmedDraft();
    draft.status = 'draft';

    await expect(executor.executeConfirmedDraft(draft)).rejects.toThrow(
      "Draft status is draft, must be 'confirmed' or 'persisted'",
    );
  });

  it('should preserve failed execution status for recovery handling', async () => {
    const context = createTestInfrastructureContext();
    const execute = vi.fn<WorkflowEngine['execute']>().mockResolvedValue({
      ...createExecutionRecord(),
      status: 'FAILED',
      steps: [
        {
          stepId: 'step-1',
          status: 'FAILED',
          error: 'delegate failed',
        },
      ],
    } as ExecutionRecord);
    const workflowEngine = {
      execute,
    } as unknown as WorkflowEngine;

    const executor = createDraftExecutor({
      context,
      workflowEngine,
    });

    const result = await executor.executeConfirmedDraft(createConfirmedDraft());

    expect(result.executionRecord.status).toBe('FAILED');
    expect(result.executionRecord.steps[0]?.error).toBe('delegate failed');
  });
});
