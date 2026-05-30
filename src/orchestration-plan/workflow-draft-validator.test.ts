import { describe, it, expect } from 'vitest';
import { validateWorkflowDraft, WorkflowDraftSchema } from './workflow-draft-validator.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';

function createValidDraft(overrides?: Partial<WorkflowDraft>): WorkflowDraft {
  return {
    schemaVersion: '1.0',
    draftId: 'draft-001',
    planId: 'plan-001',
    status: 'draft',
    name: 'Test draft',
    mode: 'strict',
    steps: [
      {
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: 'Run tests',
        dependsOn: [],
        command: { cli: 'npm', args: ['run', 'test'] },
        sideEffect: 'read',
      },
    ],
    safetyReview: {
      status: 'not_reviewed',
      findings: [],
    },
    snapshot: {
      planHash: 'hash-123',
      workflowHash: 'hash-456',
      generatedAt: '2026-05-31T00:00:00Z',
      sourceCwd: '/project',
    },
    verification: {
      required: true,
      commands: [{ cli: 'npm', args: ['run', 'test'] }],
      successCriteria: ['tests pass'],
    },
    metadata: {
      createdAt: '2026-05-31T00:00:00Z',
      createdFrom: 'run',
      cwd: '/project',
      dryRunAvailable: true,
      persistRequested: false,
    },
    ...overrides,
  };
}

describe('WorkflowDraftSchema', () => {
  it('accepts a valid draft structure', () => {
    const draft = createValidDraft();
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('rejects invalid schemaVersion', () => {
    const draft = createValidDraft({ schemaVersion: '2.0' as any });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects empty draftId', () => {
    const draft = createValidDraft({ draftId: '' });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects empty planId', () => {
    const draft = createValidDraft({ planId: '' });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const draft = createValidDraft({ status: 'invalid' as any });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const draft = createValidDraft({ name: '' });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode', () => {
    const draft = createValidDraft({ mode: 'invalid' as any });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });
});

describe('WorkflowDraftStep schema', () => {
  it('rejects empty step id', () => {
    const draft = createValidDraft({
      steps: [{
        id: '',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: 'test',
        dependsOn: [],
        command: { cli: 'npm', args: ['test'] },
        sideEffect: 'none',
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects empty sourceTaskId', () => {
    const draft = createValidDraft({
      steps: [{
        id: 'step-1',
        sourceTaskId: '',
        type: 'exec',
        label: 'test',
        dependsOn: [],
        command: { cli: 'npm', args: ['test'] },
        sideEffect: 'none',
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects invalid step type', () => {
    const draft = createValidDraft({
      steps: [{
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'invalid' as any,
        label: 'test',
        dependsOn: [],
        sideEffect: 'none',
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects empty label', () => {
    const draft = createValidDraft({
      steps: [{
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: '',
        dependsOn: [],
        command: { cli: 'npm', args: ['test'] },
        sideEffect: 'none',
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects invalid sideEffect', () => {
    const draft = createValidDraft({
      steps: [{
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: 'test',
        dependsOn: [],
        command: { cli: 'npm', args: ['test'] },
        sideEffect: 'invalid' as any,
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('accepts valid exec step with command', () => {
    const draft = createValidDraft({
      steps: [{
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'exec',
        label: 'Run command',
        dependsOn: [],
        command: { cli: 'npm', args: ['run', 'test'] },
        sideEffect: 'read',
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('accepts valid delegate step', () => {
    const draft = createValidDraft({
      steps: [{
        id: 'step-1',
        sourceTaskId: 'task-1',
        type: 'delegate',
        label: 'Delegate to agent',
        dependsOn: [],
        delegate: { to: 'codex', prompt: 'help' },
        sideEffect: 'write',
      }],
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });
});

describe('DraftSafetyReview schema', () => {
  it('rejects invalid safety review status', () => {
    const draft = createValidDraft({
      safetyReview: {
        status: 'invalid' as any,
        findings: [],
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('accepts valid safety finding', () => {
    const draft = createValidDraft({
      safetyReview: {
        status: 'needs_confirmation',
        findings: [{
          stepId: 'step-1',
          level: 'high',
          category: 'command',
          reason: 'destructive command',
          requiredAction: 'confirm',
        }],
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });
});

describe('DraftConfirmation schema', () => {
  it('accepts valid confirmation record', () => {
    const draft = createValidDraft({
      confirmation: {
        confirmedAt: '2026-05-31T00:00:00Z',
        confirmedBy: 'user',
        confirmedTaskIds: ['task-1'],
        deniedTaskIds: [],
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('rejects invalid confirmedBy', () => {
    const draft = createValidDraft({
      confirmation: {
        confirmedAt: '2026-05-31T00:00:00Z',
        confirmedBy: 'invalid' as any,
        confirmedTaskIds: ['task-1'],
        deniedTaskIds: [],
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });
});

describe('WorkflowDraftSnapshot schema', () => {
  it('rejects empty planHash', () => {
    const draft = createValidDraft({
      snapshot: {
        planHash: '',
        workflowHash: 'hash-456',
        generatedAt: '2026-05-31T00:00:00Z',
        sourceCwd: '/project',
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it('rejects empty workflowHash', () => {
    const draft = createValidDraft({
      snapshot: {
        planHash: 'hash-123',
        workflowHash: '',
        generatedAt: '2026-05-31T00:00:00Z',
        sourceCwd: '/project',
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });
});

describe('WorkflowDraftMetadata schema', () => {
  it('rejects invalid createdFrom', () => {
    const draft = createValidDraft({
      metadata: {
        createdAt: '2026-05-31T00:00:00Z',
        createdFrom: 'invalid' as any,
        cwd: '/project',
        dryRunAvailable: true,
        persistRequested: false,
      },
    });
    const result = WorkflowDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });
});

describe('validateWorkflowDraft', () => {
  it('returns valid for a correct draft', () => {
    const draft = createValidDraft();
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.draft).toBeDefined();
  });

  it('returns schema errors for invalid input', () => {
    const result = validateWorkflowDraft({ invalid: true });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns schema errors for null input', () => {
    const result = validateWorkflowDraft(null);
    expect(result.valid).toBe(false);
  });
});

describe('Business rule: duplicate step ids', () => {
  it('rejects draft with duplicate step ids', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'First step',
          dependsOn: [],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
        {
          id: 'step-1',
          sourceTaskId: 'task-2',
          type: 'exec',
          label: 'Duplicate step',
          dependsOn: [],
          command: { cli: 'npm', args: ['lint'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'duplicate_step_id')).toBe(true);
  });
});

describe('Business rule: step dependsOn references', () => {
  it('rejects draft with non-existent step dependency', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Step',
          dependsOn: ['non-existent'],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'invalid_step_dependency')).toBe(true);
  });

  it('accepts draft with valid dependency chain', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'First',
          dependsOn: [],
          command: { cli: 'npm', args: ['install'] },
          sideEffect: 'none',
        },
        {
          id: 'step-2',
          sourceTaskId: 'task-2',
          type: 'exec',
          label: 'Second',
          dependsOn: ['step-1'],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: step type requirements', () => {
  it('rejects exec step without command', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Exec step',
          dependsOn: [],
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'exec_step_missing_command')).toBe(true);
  });

  it('rejects delegate step without delegate', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'delegate',
          label: 'Delegate step',
          dependsOn: [],
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'delegate_step_missing_delegate')).toBe(true);
  });

  it('accepts exec step with command', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Exec step',
          dependsOn: [],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });

  it('accepts delegate step with delegate', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'delegate',
          label: 'Delegate step',
          dependsOn: [],
          delegate: { to: 'codex', prompt: 'help' },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: safety review for executable status', () => {
  it('rejects confirmed status when safety review is blocked', () => {
    const draft = createValidDraft({
      status: 'confirmed',
      safetyReview: {
        status: 'blocked',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'unsafe_draft_cannot_execute')).toBe(true);
  });

  it('rejects persisted status when safety review is blocked', () => {
    const draft = createValidDraft({
      status: 'persisted',
      safetyReview: {
        status: 'blocked',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'unsafe_draft_cannot_execute')).toBe(true);
  });

  it('rejects executing status when safety review is blocked', () => {
    const draft = createValidDraft({
      status: 'executing',
      safetyReview: {
        status: 'blocked',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'unsafe_draft_cannot_execute')).toBe(true);
  });

  it('rejects confirmed status when safety review is not_reviewed', () => {
    const draft = createValidDraft({
      status: 'confirmed',
      safetyReview: {
        status: 'not_reviewed',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'draft_not_reviewed_cannot_execute')).toBe(true);
  });

  it('rejects persisted status when safety review is not_reviewed', () => {
    const draft = createValidDraft({
      status: 'persisted',
      safetyReview: {
        status: 'not_reviewed',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'draft_not_reviewed_cannot_execute')).toBe(true);
  });

  it('rejects executing status when safety review is not_reviewed', () => {
    const draft = createValidDraft({
      status: 'executing',
      safetyReview: {
        status: 'not_reviewed',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'draft_not_reviewed_cannot_execute')).toBe(true);
  });

  it('rejects confirmed status when needs_confirmation without confirmation', () => {
    const draft = createValidDraft({
      status: 'confirmed',
      safetyReview: {
        status: 'needs_confirmation',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'needs_confirmation_without_confirmation')).toBe(true);
  });

  it('accepts confirmed status when needs_confirmation with confirmation', () => {
    const draft = createValidDraft({
      status: 'confirmed',
      safetyReview: {
        status: 'needs_confirmation',
        findings: [],
      },
      confirmation: {
        confirmedAt: '2026-05-31T00:00:00Z',
        confirmedBy: 'user',
        confirmedTaskIds: ['task-1'],
        deniedTaskIds: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });

  it('accepts draft status with blocked safety review', () => {
    const draft = createValidDraft({
      status: 'draft',
      safetyReview: {
        status: 'blocked',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });

  it('accepts confirmed status when safety review is safe', () => {
    const draft = createValidDraft({
      status: 'confirmed',
      safetyReview: {
        status: 'safe',
        findings: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });
});

describe('Business rule: circular step dependencies', () => {
  it('rejects draft with direct circular dependency', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Step 1',
          dependsOn: ['step-2'],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
        {
          id: 'step-2',
          sourceTaskId: 'task-2',
          type: 'exec',
          label: 'Step 2',
          dependsOn: ['step-1'],
          command: { cli: 'npm', args: ['lint'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'circular_step_dependency')).toBe(true);
  });

  it('rejects draft with indirect circular dependency', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Step 1',
          dependsOn: ['step-3'],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
        {
          id: 'step-2',
          sourceTaskId: 'task-2',
          type: 'exec',
          label: 'Step 2',
          dependsOn: ['step-1'],
          command: { cli: 'npm', args: ['lint'] },
          sideEffect: 'none',
        },
        {
          id: 'step-3',
          sourceTaskId: 'task-3',
          type: 'exec',
          label: 'Step 3',
          dependsOn: ['step-2'],
          command: { cli: 'npm', args: ['build'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'circular_step_dependency')).toBe(true);
  });

  it('accepts draft with no circular dependencies', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Step 1',
          dependsOn: [],
          command: { cli: 'npm', args: ['install'] },
          sideEffect: 'none',
        },
        {
          id: 'step-2',
          sourceTaskId: 'task-2',
          type: 'exec',
          label: 'Step 2',
          dependsOn: ['step-1'],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
        {
          id: 'step-3',
          sourceTaskId: 'task-3',
          type: 'exec',
          label: 'Step 3',
          dependsOn: ['step-2'],
          command: { cli: 'npm', args: ['build'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });

  it('accepts draft with self-referential dependency (but that should be caught by invalid_step_dependency?)', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Step 1',
          dependsOn: ['step-1'],
          command: { cli: 'npm', args: ['test'] },
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
  });
});

describe('Optional fields', () => {
  it('accepts draft with confirmation', () => {
    const draft = createValidDraft({
      confirmation: {
        confirmedAt: '2026-05-31T00:00:00Z',
        confirmedBy: 'user',
        confirmedTaskIds: ['task-1'],
        deniedTaskIds: [],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });

  it('accepts draft with trace', () => {
    const draft = createValidDraft({
      trace: {
        traceId: 'trace-001',
        planId: 'plan-001',
        executionId: 'exec-1',
        auditEventIds: ['audit-1'],
      },
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });

  it('accepts draft without optional fields', () => {
    const draft = createValidDraft();
    delete (draft as any).confirmation;
    delete (draft as any).trace;
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(true);
  });
});

describe('Multiple business rule violations', () => {
  it('reports all business rule errors', () => {
    const draft = createValidDraft({
      steps: [
        {
          id: 'step-1',
          sourceTaskId: 'task-1',
          type: 'exec',
          label: 'Exec without command',
          dependsOn: ['non-existent'],
          sideEffect: 'none',
        },
        {
          id: 'step-1',
          sourceTaskId: 'task-2',
          type: 'delegate',
          label: 'Delegate without delegate',
          dependsOn: [],
          sideEffect: 'none',
        },
      ],
    });
    const result = validateWorkflowDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'duplicate_step_id')).toBe(true);
    expect(result.errors.some(e => e.code === 'invalid_step_dependency')).toBe(true);
    expect(result.errors.some(e => e.code === 'exec_step_missing_command')).toBe(true);
    expect(result.errors.some(e => e.code === 'delegate_step_missing_delegate')).toBe(true);
  });
});
