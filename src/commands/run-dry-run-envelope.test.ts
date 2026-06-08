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

describe('run-dry-run-envelope', () => {
  describe('buildReplyEnvelope', () => {
    it('should create reply envelope with intent', () => {
      const envelope = buildReplyEnvelope('hello', 'greet');
      expect(envelope).toEqual({
        ok: true,
        dryRun: true,
        result: { kind: 'reply', reply: 'hello' },
        reply: 'hello',
        intent: 'greet',
      });
    });

    it('should create reply envelope without intent', () => {
      const envelope = buildReplyEnvelope('hello');
      expect(envelope).toEqual({
        ok: true,
        dryRun: true,
        result: { kind: 'reply', reply: 'hello' },
        reply: 'hello',
      });
    });

    it('should have result.kind = reply', () => {
      const envelope = buildReplyEnvelope('test');
      expect(envelope.result.kind).toBe('reply');
    });
  });

  describe('buildPlanEnvelope', () => {
    const mockPlan = {
      goal: { action: 'health_check' },
      requiresExecution: true,
      steps: [{ cli: 'echo', args: ['hello'] }],
      commands: [{ cli: 'echo', args: ['hello'] }],
      summary: 'test plan',
      userReport: {
        summaryTemplate: 'test summary',
        nextActions: ['check output'],
        verificationSteps: ['verify'],
      },
    };

    it('should create plan envelope from execution plan', () => {
      const envelope = buildPlanEnvelope(mockPlan);
      expect(envelope.ok).toBe(true);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('plan');
      expect(envelope.plan).toBeDefined();
      expect(envelope.userReport).toBeDefined();
    });

    it('should include intent when provided', () => {
      const envelope = buildPlanEnvelope(mockPlan, 'test_intent');
      expect(envelope.intent).toBe('test_intent');
    });
  });

  describe('buildWorkflowDraftEnvelope', () => {
    it('should create workflow draft envelope', () => {
      const workflow = {
        name: 'test-workflow',
        steps: [{ cli: 'echo', args: ['hello'] }],
      };
      const envelope = buildWorkflowDraftEnvelope(workflow);
      expect(envelope).toEqual({
        ok: true,
        dryRun: true,
        result: {
          kind: 'workflow_draft',
          workflow: {
            name: 'test-workflow',
            steps: [{ cli: 'echo', args: ['hello'] }],
          },
        },
        workflow: {
          name: 'test-workflow',
          steps: [{ cli: 'echo', args: ['hello'] }],
        },
      });
    });

    it('should have result.kind = workflow_draft', () => {
      const envelope = buildWorkflowDraftEnvelope({ name: 'test', steps: [] });
      expect(envelope.result.kind).toBe('workflow_draft');
    });
  });

  describe('buildStepsEnvelope', () => {
    it('should create steps envelope', () => {
      const steps = [
        { cli: 'echo', args: ['hello'] },
        { cli: 'ls', args: ['-la'] },
      ];
      const envelope = buildStepsEnvelope(steps);
      expect(envelope.ok).toBe(true);
      expect(envelope.dryRun).toBe(true);
      expect(envelope.result.kind).toBe('workflow_draft');
      expect(envelope.steps).toEqual(steps);
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

  describe('backward compatibility', () => {
    it('reply envelope preserves reply field', () => {
      const envelope = buildReplyEnvelope('test reply', 'test_intent');
      expect(envelope.reply).toBe('test reply');
      expect(envelope.intent).toBe('test_intent');
    });

    it('workflow draft envelope preserves workflow field', () => {
      const workflow = { name: 'test', steps: [{ cli: 'echo', args: [] }] };
      const envelope = buildWorkflowDraftEnvelope(workflow);
      expect(envelope.workflow).toEqual(workflow);
    });

    it('steps envelope preserves steps field', () => {
      const steps = [{ cli: 'echo', args: ['hello'] }];
      const envelope = buildStepsEnvelope(steps);
      expect(envelope.steps).toEqual(steps);
    });
  });

  describe('mode in dry-run envelope', () => {
    it('buildWorkflowDraftEnvelope includes mode when provided', () => {
      const workflow = { name: 'test', steps: [{ cli: 'echo', args: ['hello'] }] };
      const envelope = buildWorkflowDraftEnvelope(workflow, 'strict');
      expect(envelope.mode).toBe('strict');
    });

    it('buildWorkflowDraftEnvelope omits mode when not provided', () => {
      const workflow = { name: 'test', steps: [{ cli: 'echo', args: ['hello'] }] };
      const envelope = buildWorkflowDraftEnvelope(workflow);
      expect(envelope.mode).toBeUndefined();
    });

    it('buildStepsEnvelope includes mode when provided', () => {
      const steps = [{ cli: 'echo', args: ['hello'] }];
      const envelope = buildStepsEnvelope(steps, 'consensus');
      expect(envelope.mode).toBe('consensus');
    });

    it('buildStepsEnvelope omits mode when not provided', () => {
      const steps = [{ cli: 'echo', args: ['hello'] }];
      const envelope = buildStepsEnvelope(steps);
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
