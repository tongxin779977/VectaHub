import { describe, expect, it } from 'vitest';
import {
  buildReplyEnvelope,
  buildPlanEnvelope,
  buildWorkflowDraftEnvelope,
  buildStepsEnvelope,
  buildBlockedEnvelope,
  buildClarifyEnvelope,
  getModeDescription,
} from './run-dry-run-envelope.js';
import type { ExecutionPlan } from '../nl/capabilities/types.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';
import { stepsToWorkflowDraft, workflowToDraft } from '../orchestration-plan/workflow-draft-adapter.js';

function createMockPlan(overrides?: Partial<ExecutionPlan>): ExecutionPlan {
  return {
    id: 'plan-001',
    label: 'Test Plan',
    capabilityId: 'test-capability',
    goal: { action: 'test' },
    steps: [],
    userReport: {
      summaryTemplate: 'test summary',
      nextActions: [],
      verificationSteps: [],
    },
    ...overrides,
  };
}

function createMockDraft(overrides?: Partial<WorkflowDraft>): WorkflowDraft {
  return {
    schemaVersion: '1.0',
    draftId: 'draft-test',
    planId: 'plan-test',
    status: 'draft',
    name: 'test-workflow',
    mode: 'strict',
    steps: [
      {
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: 'echo hello',
        dependsOn: [],
        command: { cli: 'echo', args: ['hello'] },
        sideEffect: 'command',
      },
    ],
    safetyReview: {
      status: 'not_reviewed',
      findings: [],
    },
    snapshot: {
      planHash: 'hash-123',
      workflowHash: 'hash-456',
      generatedAt: '2026-06-08T00:00:00Z',
      sourceCwd: '/project',
    },
    verification: {
      required: false,
      commands: [],
      successCriteria: [],
    },
    metadata: {
      createdAt: '2026-06-08T00:00:00Z',
      createdFrom: 'run',
      cwd: '/project',
      dryRunAvailable: true,
      persistRequested: false,
    },
    ...overrides,
  };
}

describe('run-dry-run-envelope', () => {
  describe('envelope structure', () => {
    it('all envelopes have schemaVersion 1.0', () => {
      const draft = createMockDraft();
      const envelopes = [
        buildReplyEnvelope('hello'),
        buildClarifyEnvelope('need info'),
        buildBlockedEnvelope('blocked', {
          executable: false,
          type: 'blocked' as const,
          reason: 'no_steps',
          summary: '无命令',
          suggestedAction: '请重新描述',
        }),
        buildPlanEnvelope(createMockPlan()),
        buildWorkflowDraftEnvelope(draft),
        buildStepsEnvelope(draft),
      ];
      for (const envelope of envelopes) {
        expect(envelope.schemaVersion).toBe('1.0');
      }
    });

    it('all envelopes have ISO 8601 timestamp', () => {
      const before = new Date();
      const draft = createMockDraft();
      const envelopes = [
        buildReplyEnvelope('hello'),
        buildClarifyEnvelope('need info'),
        buildBlockedEnvelope('blocked', {
          executable: false,
          type: 'blocked' as const,
          reason: 'no_steps',
          summary: '无命令',
          suggestedAction: '请重新描述',
        }),
        buildPlanEnvelope(createMockPlan()),
        buildWorkflowDraftEnvelope(draft),
        buildStepsEnvelope(draft),
      ];
      const after = new Date();
      for (const envelope of envelopes) {
        const ts = new Date(envelope.timestamp);
        expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });

    it('all envelopes have dryRun true', () => {
      const envelope = buildReplyEnvelope('hello');
      expect(envelope.dryRun).toBe(true);
    });
  });

  describe('buildReplyEnvelope', () => {
    it('should create reply envelope with intent', () => {
      const envelope = buildReplyEnvelope('hello', 'greet');
      expect(envelope.ok).toBe(true);
      expect(envelope.result).toEqual({ kind: 'reply', reply: 'hello' });
      expect(envelope.intent).toBe('greet');
    });

    it('should create reply envelope without intent', () => {
      const envelope = buildReplyEnvelope('hello');
      expect(envelope.ok).toBe(true);
      expect(envelope.result).toEqual({ kind: 'reply', reply: 'hello' });
      expect(envelope.intent).toBeUndefined();
    });

    it('should have result.kind = reply', () => {
      const envelope = buildReplyEnvelope('test');
      expect(envelope.result.kind).toBe('reply');
    });

    it('result.reply contains the reply text', () => {
      const envelope = buildReplyEnvelope('test reply');
      expect(envelope.result.kind).toBe('reply');
      if (envelope.result.kind === 'reply') {
        expect(envelope.result.reply).toBe('test reply');
      }
    });
  });

  describe('buildPlanEnvelope', () => {
    const mockPlan = createMockPlan({
      steps: [
        { id: 'step-1', label: 'Run echo', type: 'command' as const, command: { cli: 'echo', args: ['hello'] } },
      ],
    });

    it('should create plan envelope from execution plan', () => {
      const envelope = buildPlanEnvelope(mockPlan);
      expect(envelope.ok).toBe(true);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('plan');
      if (envelope.result.kind === 'plan') {
        expect(envelope.result.plan).toBeDefined();
        expect(envelope.result.plan.schemaVersion).toBe('1.0');
        expect(envelope.result.plan.planId).toBe('plan-001');
        expect(envelope.result.plan.tasks).toHaveLength(1);
        expect(envelope.result.userReport).toBeDefined();
      }
    });

    it('should include intent when provided', () => {
      const envelope = buildPlanEnvelope(mockPlan, 'test_intent');
      expect(envelope.intent).toBe('test_intent');
    });

    it('plan field is OrchestrationPlan with schemaVersion', () => {
      const envelope = buildPlanEnvelope(mockPlan);
      if (envelope.result.kind === 'plan') {
        expect(envelope.result.plan.schemaVersion).toBe('1.0');
        expect(envelope.result.plan.source).toBe('run');
        expect(envelope.result.plan.goal).toBe('test');
        expect(envelope.result.plan.status).toBeDefined();
        expect(envelope.result.plan.safetyReview).toBeDefined();
        expect(envelope.result.plan.verification).toBeDefined();
        expect(envelope.result.plan.metadata).toBeDefined();
      }
    });
  });

  describe('buildWorkflowDraftEnvelope', () => {
    it('should create workflow draft envelope with WorkflowDraft', () => {
      const draft = createMockDraft();
      const envelope = buildWorkflowDraftEnvelope(draft);
      expect(envelope.ok).toBe(true);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('workflow_draft');
      if (envelope.result.kind === 'workflow_draft') {
        expect(envelope.result.workflow.schemaVersion).toBe('1.0');
        expect(envelope.result.workflow.draftId).toBe('draft-test');
        expect(envelope.result.workflow.name).toBe('test-workflow');
        expect(envelope.result.workflow.steps).toHaveLength(1);
      }
    });

    it('should have result.kind = workflow_draft', () => {
      const draft = createMockDraft();
      const envelope = buildWorkflowDraftEnvelope(draft);
      expect(envelope.result.kind).toBe('workflow_draft');
    });

    it('workflow field is WorkflowDraft with schemaVersion', () => {
      const draft = createMockDraft();
      const envelope = buildWorkflowDraftEnvelope(draft);
      if (envelope.result.kind === 'workflow_draft') {
        expect(envelope.result.workflow.schemaVersion).toBe('1.0');
        expect(envelope.result.workflow.draftId).toBeTruthy();
        expect(envelope.result.workflow.planId).toBeTruthy();
        expect(envelope.result.workflow.status).toBeDefined();
        expect(envelope.result.workflow.safetyReview).toBeDefined();
        expect(envelope.result.workflow.verification).toBeDefined();
        expect(envelope.result.workflow.metadata).toBeDefined();
      }
    });
  });

  describe('buildStepsEnvelope', () => {
    it('should create steps envelope with WorkflowDraft', () => {
      const { draft } = stepsToWorkflowDraft([
        { cli: 'echo', args: ['hello'] },
        { cli: 'ls', args: ['-la'] },
      ]);
      const envelope = buildStepsEnvelope(draft);
      expect(envelope.ok).toBe(true);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('workflow_draft');
      if (envelope.result.kind === 'workflow_draft') {
        expect(envelope.result.workflow.schemaVersion).toBe('1.0');
        expect(envelope.result.workflow.steps).toHaveLength(2);
        expect(envelope.result.workflow.steps[0].command?.cli).toBe('echo');
        expect(envelope.result.workflow.steps[1].command?.cli).toBe('ls');
      }
    });

    it('steps envelope workflow is WorkflowDraft with full structure', () => {
      const { draft } = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);
      const envelope = buildStepsEnvelope(draft);
      if (envelope.result.kind === 'workflow_draft') {
        expect(envelope.result.workflow.schemaVersion).toBe('1.0');
        expect(envelope.result.workflow.safetyReview).toBeDefined();
        expect(envelope.result.workflow.verification).toBeDefined();
        expect(envelope.result.workflow.metadata).toBeDefined();
      }
    });
  });

  describe('buildClarifyEnvelope', () => {
    it('should create clarify envelope', () => {
      const dispatch = {
        executable: false,
        type: 'needs_llm_or_tool' as const,
        reason: 'needs_clarification',
        summary: '需要澄清',
        suggestedAction: 'ask_for_clarification',
      };
      const envelope = buildClarifyEnvelope('需要更多信息', dispatch);
      expect(envelope.ok).toBe(true);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('clarify');
    });
  });

  describe('buildBlockedEnvelope', () => {
    it('should create blocked envelope', () => {
      const dispatch = {
        executable: false,
        type: 'blocked' as const,
        reason: 'no_steps',
        summary: '无命令',
        suggestedAction: '请重新描述',
      };
      const envelope = buildBlockedEnvelope('安全拦截', dispatch);
      expect(envelope.ok).toBe(false);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('blocked');
    });
  });

  describe('result as single source of truth', () => {
    it('reply data lives only in result', () => {
      const envelope = buildReplyEnvelope('test reply', 'test_intent');
      expect('reply' in envelope).toBe(false);
      expect(envelope.result.kind).toBe('reply');
      if (envelope.result.kind === 'reply') {
        expect(envelope.result.reply).toBe('test reply');
      }
      expect(envelope.intent).toBe('test_intent');
    });

    it('workflow data lives only in result', () => {
      const draft = createMockDraft();
      const envelope = buildWorkflowDraftEnvelope(draft);
      expect('workflow' in envelope).toBe(false);
      if (envelope.result.kind === 'workflow_draft') {
        expect(envelope.result.workflow.schemaVersion).toBe('1.0');
        expect(envelope.result.workflow.draftId).toBe('draft-test');
      }
    });

    it('steps data lives only in result.workflow', () => {
      const { draft } = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);
      const envelope = buildStepsEnvelope(draft);
      expect('steps' in envelope).toBe(false);
      if (envelope.result.kind === 'workflow_draft') {
        expect(envelope.result.workflow.steps).toHaveLength(1);
        expect(envelope.result.workflow.steps[0].command?.cli).toBe('echo');
      }
    });

    it('plan data lives only in result', () => {
      const mockPlan = createMockPlan();
      const envelope = buildPlanEnvelope(mockPlan);
      expect('plan' in envelope).toBe(false);
      expect('userReport' in envelope).toBe(false);
      if (envelope.result.kind === 'plan') {
        expect(envelope.result.plan).toBeDefined();
        expect(envelope.result.plan.schemaVersion).toBe('1.0');
        expect(envelope.result.userReport).toBeDefined();
      }
    });
  });

  describe('mode in dry-run envelope', () => {
    it('buildWorkflowDraftEnvelope includes mode when provided', () => {
      const draft = createMockDraft();
      const envelope = buildWorkflowDraftEnvelope(draft, 'strict');
      expect(envelope.mode).toBe('strict');
    });

    it('buildWorkflowDraftEnvelope omits mode when not provided', () => {
      const draft = createMockDraft();
      const envelope = buildWorkflowDraftEnvelope(draft);
      expect(envelope.mode).toBeUndefined();
    });

    it('buildStepsEnvelope includes mode when provided', () => {
      const { draft } = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);
      const envelope = buildStepsEnvelope(draft, 'consensus');
      expect(envelope.mode).toBe('consensus');
    });

    it('buildStepsEnvelope omits mode when not provided', () => {
      const { draft } = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);
      const envelope = buildStepsEnvelope(draft);
      expect(envelope.mode).toBeUndefined();
    });

    it('each mode has a non-empty description', () => {
      for (const mode of ['strict', 'relaxed', 'consensus'] as const) {
        expect(getModeDescription(mode).length).toBeGreaterThan(0);
      }
    });

    it('strict mode description mentions failure stop', () => {
      expect(getModeDescription('strict')).toContain('失败时立即停止');
    });

    it('relaxed mode description mentions continue on failure', () => {
      expect(getModeDescription('relaxed')).toContain('继续执行');
    });

    it('consensus mode description mentions consensus confirmation', () => {
      expect(getModeDescription('consensus')).toContain('共识确认');
    });
  });
});
