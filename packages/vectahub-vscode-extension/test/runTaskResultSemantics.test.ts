import { describe, expect, it } from 'vitest';
import { resolveRunTaskExecutionSemantics, resolveRunTaskFailureKind } from '../src/commands/runTaskResultSemantics.js';

describe('runTaskResultSemantics', () => {
  it('should detect unclosed execution for timeout + gitChanges + no verification', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        gitChanges: { changedFiles: ['src/a.ts'] },
      },
    });
    expect(semantics.unclosedExecution).toBe(true);
    expect(semantics.needsConfirmation).toBe(false);
  });

  it('should not treat unclosed execution as success or non-executed', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        gitChanges: { changedFiles: ['src/a.ts', 'src/b.ts'] },
        verification: undefined,
      },
    });
    expect(semantics.unclosedExecution).toBe(true);
  });

  it('should map preflight confirmation source', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        riskAssessment: {
          needsConfirmation: true,
          confirmationSource: 'preflight',
        },
      },
    });
    expect(semantics.needsConfirmation).toBe(true);
    expect(semantics.confirmationSource).toBe('preflight');
  });

  it('should treat blocked enforcement as fail-closed instead of needs_confirmation', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        riskAssessment: {
          needsConfirmation: true,
          confirmationSource: 'preflight',
          enforcement: 'blocked',
        },
      },
    });
    expect(semantics.needsConfirmation).toBe(false);
    expect(semantics.confirmationSource).toBeUndefined();
    expect(semantics.enforcement).toBe('blocked');
  });

  it('should prioritize confirm_required enforcement for preflight confirmation', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        riskAssessment: {
          needsConfirmation: false,
          confirmationSource: 'preflight',
          enforcement: 'confirm_required',
        },
      },
    });
    expect(semantics.needsConfirmation).toBe(true);
    expect(semantics.confirmationSource).toBe('preflight');
    expect(semantics.enforcement).toBe('confirm_required');
  });

  it('should map post-execution confirmation source', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        riskAssessment: {
          needsConfirmation: true,
          confirmationSource: 'post-execution',
        },
        gitChanges: { changedFiles: ['src/a.ts'] },
      },
    });
    expect(semantics.needsConfirmation).toBe(true);
    expect(semantics.confirmationSource).toBe('post-execution');
  });

  it('should prefer CLI unclosedExecution when present', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        gitChanges: { changedFiles: [] },
        verification: {},
        unclosedExecution: true,
      },
    });
    expect(semantics.unclosedExecution).toBe(true);
  });

  it('should resolve CLI failureKind when present', () => {
    const failureKind = resolveRunTaskFailureKind({
      data: {
        failureKind: 'timeout',
      },
    });
    expect(failureKind).toBe('timeout');
  });

  it('should return undefined failureKind when CLI omits it', () => {
    const failureKind = resolveRunTaskFailureKind({
      data: {},
    });
    expect(failureKind).toBeUndefined();
  });
});
