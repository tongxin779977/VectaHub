import { describe, it, expect } from 'vitest';
import { validateOrchestrationPlan, OrchestrationPlanSchema } from './validator.js';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';

function createValidPlan(overrides?: Partial<OrchestrationPlan>): OrchestrationPlan {
  return {
    schemaVersion: '1.0',
    planId: 'plan-001',
    source: 'run',
    goal: 'Run tests',
    status: 'draft',
    assumptions: [],
    tasks: [
      {
        id: 'task-1',
        kind: 'apply',
        title: 'Run test suite',
        executor: 'local',
        command: { cli: 'npm', args: ['run', 'test'] },
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'read',
        confidence: 'high',
        needsConfirmation: false,
      },
    ],
    safetyReview: {
      status: 'not_reviewed',
      maxRiskLevel: 'safe',
      findings: [],
    },
    requiredConfirmations: [],
    verification: {
      required: true,
      commands: [{ cli: 'npm', args: ['run', 'test'] }],
      semanticChecks: [],
      successCriteria: ['tests pass'],
    },
    metadata: {
      createdAt: '2026-05-31T00:00:00Z',
      cwd: '/project',
      intentRecognitionMethod: 'capability',
    },
    ...overrides,
  };
}

describe('OrchestrationPlanSchema', () => {
  it('accepts a valid plan structure', () => {
    const plan = createValidPlan();
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('rejects invalid schemaVersion', () => {
    const plan = createValidPlan({ schemaVersion: '2.0' as any });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects empty planId', () => {
    const plan = createValidPlan({ planId: '' });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const plan = createValidPlan({ status: 'invalid' as any });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects empty goal', () => {
    const plan = createValidPlan({ goal: '' });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid source', () => {
    const plan = createValidPlan({ source: 'invalid' as any });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });
});

describe('OrchestrationTask schema', () => {
  it('rejects empty task id', () => {
    const plan = createValidPlan({
      tasks: [{
        id: '',
        kind: 'apply',
        title: 'test',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'none',
        confidence: 'high',
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid task kind', () => {
    const plan = createValidPlan({
      tasks: [{
        id: 't1',
        kind: 'invalid' as any,
        title: 'test',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'none',
        confidence: 'high',
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid executor', () => {
    const plan = createValidPlan({
      tasks: [{
        id: 't1',
        kind: 'apply',
        title: 'test',
        executor: 'invalid' as any,
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'none',
        confidence: 'high',
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid sideEffect', () => {
    const plan = createValidPlan({
      tasks: [{
        id: 't1',
        kind: 'apply',
        title: 'test',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'invalid' as any,
        confidence: 'high',
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid confidence', () => {
    const plan = createValidPlan({
      tasks: [{
        id: 't1',
        kind: 'apply',
        title: 'test',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'none',
        confidence: 'invalid' as any,
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('accepts valid delegateTo values', () => {
    for (const delegateTo of ['codex', 'claude', 'gemini', 'aider', 'custom'] as const) {
      const plan = createValidPlan({
        tasks: [{
          id: 't1',
          kind: 'apply',
          title: 'test',
          executor: 'agent',
          delegateTo,
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        }],
      });
      const result = OrchestrationPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });
});

describe('CommandInvocation schema', () => {
  it('rejects empty cli', () => {
    const plan = createValidPlan({
      tasks: [{
        id: 't1',
        kind: 'apply',
        title: 'test',
        executor: 'local',
        command: { cli: '', args: [] },
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'command',
        confidence: 'high',
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('accepts valid command with args', () => {
    const plan = createValidPlan({
      tasks: [{
        id: 't1',
        kind: 'apply',
        title: 'test',
        executor: 'local',
        command: { cli: 'npm', args: ['run', 'test'] },
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'command',
        confidence: 'high',
        needsConfirmation: false,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('accepts valid envPolicy values', () => {
    for (const envPolicy of ['inherit-safe', 'explicit-only'] as const) {
      const plan = createValidPlan({
        tasks: [{
          id: 't1',
          kind: 'apply',
          title: 'test',
          executor: 'local',
          command: { cli: 'npm', args: ['test'], envPolicy },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'command',
          confidence: 'high',
          needsConfirmation: false,
        }],
      });
      const result = OrchestrationPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });
});

describe('PlanSafetyReview schema', () => {
  it('rejects invalid safety review status', () => {
    const plan = createValidPlan({
      safetyReview: {
        status: 'invalid' as any,
        maxRiskLevel: 'safe',
        findings: [],
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid maxRiskLevel', () => {
    const plan = createValidPlan({
      safetyReview: {
        status: 'not_reviewed',
        maxRiskLevel: 'invalid' as any,
        findings: [],
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('accepts valid safety finding', () => {
    const plan = createValidPlan({
      safetyReview: {
        status: 'needs_confirmation',
        maxRiskLevel: 'high',
        findings: [{
          taskId: 'task-1',
          level: 'high',
          category: 'command',
          reason: 'destructive command',
          requiredAction: 'confirm',
        }],
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('rejects invalid safety finding category', () => {
    const plan = createValidPlan({
      safetyReview: {
        status: 'not_reviewed',
        maxRiskLevel: 'safe',
        findings: [{
          level: 'high',
          category: 'invalid' as any,
          reason: 'test',
          requiredAction: 'block',
        }],
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });
});

describe('ConfirmationRequest schema', () => {
  it('rejects empty confirmation id', () => {
    const plan = createValidPlan({
      requiredConfirmations: [{
        id: '',
        taskIds: ['task-1'],
        reason: 'test',
        prompt: 'confirm?',
        defaultAction: 'deny',
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid defaultAction', () => {
    const plan = createValidPlan({
      requiredConfirmations: [{
        id: 'conf-1',
        taskIds: ['task-1'],
        reason: 'test',
        prompt: 'confirm?',
        defaultAction: 'invalid' as any,
      }],
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });
});

describe('VerificationPlan schema', () => {
  it('rejects invalid semantic check id', () => {
    const plan = createValidPlan({
      verification: {
        required: true,
        commands: [],
        semanticChecks: [{
          id: '',
          description: 'test',
          expectedMeaning: 'pass',
        }],
        successCriteria: [],
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });
});

describe('OrchestrationPlanMetadata schema', () => {
  it('rejects invalid intentRecognitionMethod', () => {
    const plan = createValidPlan({
      metadata: {
        createdAt: '2026-05-31T00:00:00Z',
        cwd: '/project',
        intentRecognitionMethod: 'invalid' as any,
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects confidence > 1', () => {
    const plan = createValidPlan({
      metadata: {
        createdAt: '2026-05-31T00:00:00Z',
        cwd: '/project',
        intentRecognitionMethod: 'capability',
        confidence: 1.5,
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects confidence < 0', () => {
    const plan = createValidPlan({
      metadata: {
        createdAt: '2026-05-31T00:00:00Z',
        cwd: '/project',
        intentRecognitionMethod: 'capability',
        confidence: -0.1,
      },
    });
    const result = OrchestrationPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });
});

describe('validateOrchestrationPlan', () => {
  it('returns valid for a correct plan', () => {
    const plan = createValidPlan();
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.plan).toBeDefined();
  });

  it('returns schema errors for invalid input', () => {
    const result = validateOrchestrationPlan({ invalid: true });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns schema errors for null input', () => {
    const result = validateOrchestrationPlan(null);
    expect(result.valid).toBe(false);
  });

  it('returns schema errors for non-object input', () => {
    const result = validateOrchestrationPlan('string');
    expect(result.valid).toBe(false);
  });
});

describe('Business rule: duplicate task ids', () => {
  it('rejects plan with duplicate task ids', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'First task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
        {
          id: 'task-1',
          kind: 'inspect',
          title: 'Duplicate task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'duplicate_task_id')).toBe(true);
  });

  it('accepts plan with unique task ids', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'First task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
        {
          id: 'task-2',
          kind: 'inspect',
          title: 'Second task',
          executor: 'local',
          dependsOn: ['task-1'],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: dependsOn references', () => {
  it('rejects plan with non-existent dependency', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Task',
          executor: 'local',
          dependsOn: ['non-existent'],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'invalid_dependency')).toBe(true);
  });

  it('accepts plan with valid dependency chain', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'First',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
        {
          id: 'task-2',
          kind: 'verify',
          title: 'Second',
          executor: 'local',
          dependsOn: ['task-1'],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: agent executor requires delegateTo', () => {
  it('rejects agent task without delegateTo', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Agent task',
          executor: 'agent',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'agent_missing_delegate')).toBe(true);
  });

  it('accepts agent task with delegateTo', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Agent task',
          executor: 'agent',
          delegateTo: 'codex',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('allows agent task without delegateTo when plan is blocked', () => {
    const plan = createValidPlan({
      status: 'blocked',
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Agent task',
          executor: 'agent',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('allows agent task without delegateTo when needsConfirmation', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Agent task',
          executor: 'agent',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: true,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: reply task should not carry command', () => {
  it('rejects reply task with command', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'reply',
          title: 'Reply task',
          executor: 'local',
          command: { cli: 'echo', args: ['hello'] },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'reply_with_command')).toBe(true);
  });

  it('accepts reply task without command', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'reply',
          title: 'Reply task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: confirmation task ids must exist', () => {
  it('rejects confirmation referencing non-existent task', () => {
    const plan = createValidPlan({
      requiredConfirmations: [{
        id: 'conf-1',
        taskIds: ['non-existent'],
        reason: 'test',
        prompt: 'confirm?',
        defaultAction: 'deny',
      }],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'confirmation_invalid_task')).toBe(true);
  });

  it('accepts confirmation referencing existing task', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'write',
          confidence: 'high',
          needsConfirmation: true,
        },
      ],
      requiredConfirmations: [{
        id: 'conf-1',
        taskIds: ['task-1'],
        reason: 'write operation',
        prompt: 'Confirm write?',
        defaultAction: 'deny',
      }],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});

describe('Optional fields', () => {
  it('accepts plan with workflowDraft', () => {
    const plan = createValidPlan({
      workflowDraft: {
        draftId: 'draft-001',
        stepCount: 3,
        hasSideEffects: true,
        requiresConfirmation: true,
      },
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('accepts plan with trace', () => {
    const plan = createValidPlan({
      trace: {
        traceId: 'trace-001',
        auditEventIds: ['audit-1'],
        executionId: 'exec-1',
      },
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('accepts plan without optional fields', () => {
    const plan = createValidPlan();
    delete (plan as any).workflowDraft;
    delete (plan as any).trace;
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});

describe('Multiple business rule violations', () => {
  it('reports all business rule errors', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'reply',
          title: 'Reply with command',
          executor: 'agent',
          command: { cli: 'echo', args: ['hello'] },
          dependsOn: ['non-existent'],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Duplicate',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'duplicate_task_id')).toBe(true);
    expect(result.errors.some(e => e.code === 'invalid_dependency')).toBe(true);
    expect(result.errors.some(e => e.code === 'reply_with_command')).toBe(true);
    expect(result.errors.some(e => e.code === 'agent_missing_delegate')).toBe(true);
  });
});

describe('Business rule: command surface validation', () => {
  it('rejects task with unknown vectahub command', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Test task',
          executor: 'local',
          command: { cli: 'vectahub', args: ['unknown-command'] },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'unknown_command')).toBe(true);
  });

  it('rejects verification with unknown vectahub command', () => {
    const plan = createValidPlan({
      verification: {
        required: true,
        commands: [{ cli: 'vectahub', args: ['unknown-command'] }],
        semanticChecks: [],
        successCriteria: [],
      },
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'unknown_command')).toBe(true);
  });

  it('accepts plan with valid vectahub commands', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Test task',
          executor: 'local',
          command: { cli: 'vectahub', args: ['run', '--help'] },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
      verification: {
        required: true,
        commands: [{ cli: 'vectahub', args: ['config', 'show'] }],
        semanticChecks: [],
        successCriteria: [],
      },
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('accepts plan with non-vectahub commands (like git, npm)', () => {
    const plan = createValidPlan({
      tasks: [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Git status',
          executor: 'local',
          command: { cli: 'git', args: ['status'] },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ],
    });
    const result = validateOrchestrationPlan(plan);
    expect(result.valid).toBe(true);
  });
});
