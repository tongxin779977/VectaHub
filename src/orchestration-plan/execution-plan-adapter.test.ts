import { describe, it, expect } from 'vitest';
import { executionPlanToOrchestrationPlan } from './execution-plan-adapter.js';
import type { ExecutionPlan } from '../nl/capabilities/types.js';

function createExecutionPlan(overrides?: Partial<ExecutionPlan>): ExecutionPlan {
  return {
    id: 'exec-plan-001',
    label: 'Test Plan',
    capabilityId: 'git-workflow',
    goal: { action: 'commit changes' },
    steps: [
      {
        id: 'step-1',
        label: 'Stage files',
        type: 'command',
        command: { cli: 'git', args: ['add', '.'] },
        outputVar: 'stagedFiles',
      },
      {
        id: 'step-2',
        label: 'Commit',
        type: 'command',
        command: { cli: 'git', args: ['commit', '-m', 'message'] },
      },
    ],
    userReport: {
      summaryTemplate: 'Changes committed',
      nextActions: ['Push to remote'],
      verificationSteps: ['Check git log'],
    },
    ...overrides,
  };
}

describe('executionPlanToOrchestrationPlan', () => {
  it('converts ExecutionPlan to valid OrchestrationPlan', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.validation.valid).toBe(true);
    expect(result.plan.schemaVersion).toBe('1.0');
    expect(result.plan.planId).toBe('exec-plan-001');
    expect(result.plan.source).toBe('run');
    expect(result.plan.goal).toBe('commit changes');
    expect(result.plan.status).toBe('needs_confirmation');
    expect(result.plan.tasks).toHaveLength(2);
  });

  it('maps command steps to apply tasks with command field', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    const task1 = result.plan.tasks[0];
    expect(task1.id).toBe('step-1');
    expect(task1.kind).toBe('apply');
    expect(task1.executor).toBe('local');
    expect(task1.command).toEqual({ cli: 'git', args: ['add', '.'] });
    expect(task1.sideEffect).toBe('command');
    expect(task1.needsConfirmation).toBe(true);
  });

  it('maps outputVar to PlanOutputRef', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    const task1 = result.plan.tasks[0];
    expect(task1.outputs).toEqual([
      { kind: 'text', ref: 'stagedFiles', required: true },
    ]);
  });

  it('maps workflow steps to apply tasks with workflow executor', () => {
    const executionPlan = createExecutionPlan({
      steps: [
        {
          id: 'step-1',
          label: 'Run CI workflow',
          type: 'workflow',
          workflowFile: 'ci-check.yaml',
        },
      ],
    });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.tasks[0].executor).toBe('workflow');
    expect(result.plan.tasks[0].sideEffect).toBe('write');
  });

  it('maps internal steps to reply tasks', () => {
    const executionPlan = createExecutionPlan({
      steps: [
        {
          id: 'step-1',
          label: 'Internal check',
          type: 'internal',
          internalOutput: true,
        },
      ],
    });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.tasks[0].kind).toBe('reply');
    expect(result.plan.tasks[0].sideEffect).toBe('none');
    expect(result.plan.tasks[0].needsConfirmation).toBe(false);
  });

  it('sets up dependency chain between tasks', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.tasks[0].dependsOn).toEqual([]);
    expect(result.plan.tasks[1].dependsOn).toEqual(['step-1']);
  });

  it('sets safetyReview based on task side effects', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.safetyReview.status).toBe('not_reviewed');
    expect(result.plan.safetyReview.maxRiskLevel).toBe('medium');
  });

  it('sets safetyReview to safe when no command tasks', () => {
    const executionPlan = createExecutionPlan({
      steps: [
        {
          id: 'step-1',
          label: 'Internal check',
          type: 'internal',
          internalOutput: true,
        },
      ],
    });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.safetyReview.status).toBe('safe');
    expect(result.plan.safetyReview.maxRiskLevel).toBe('safe');
  });

  it('sets status to draft when no tasks need confirmation', () => {
    const executionPlan = createExecutionPlan({
      steps: [
        {
          id: 'step-1',
          label: 'Internal check',
          type: 'internal',
          internalOutput: true,
        },
      ],
    });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.status).toBe('draft');
  });

  it('sets verification from userReport.verificationSteps', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.verification.required).toBe(true);
    expect(result.plan.verification.successCriteria).toEqual(['Check git log']);
  });

  it('maps metadata with capability info', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan, { cwd: '/project' });

    expect(result.plan.metadata.intentRecognitionMethod).toBe('capability');
    expect(result.plan.metadata.matchedCapability).toBe('git-workflow');
    expect(result.plan.metadata.cwd).toBe('/project');
    expect(result.plan.metadata.createdAt).toBeDefined();
  });

  it('accepts source option', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan, { source: 'chat' });

    expect(result.plan.source).toBe('chat');
  });

  it('handles string goal', () => {
    const executionPlan = createExecutionPlan({
      goal: 'commit changes' as unknown as Record<string, unknown>,
    });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.goal).toBe('commit changes');
  });

  it('handles goal without action field', () => {
    const executionPlan = createExecutionPlan({
      goal: {} as Record<string, unknown>,
      label: 'Fallback Label',
    });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.goal).toBe('Fallback Label');
  });

  it('produces a plan that passes Zod schema validation', () => {
    const executionPlan = createExecutionPlan();
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
  });

  it('handles empty steps', () => {
    const executionPlan = createExecutionPlan({ steps: [] });
    const result = executionPlanToOrchestrationPlan(executionPlan);

    expect(result.plan.tasks).toHaveLength(0);
    expect(result.plan.status).toBe('draft');
    expect(result.plan.safetyReview.status).toBe('safe');
    expect(result.plan.verification.required).toBe(false);
    expect(result.validation.valid).toBe(true);
  });
});
