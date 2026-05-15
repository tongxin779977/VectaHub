import { describe, expect, it } from 'vitest';
import { resolveRunTaskExecutionSemantics } from '../src/commands/runTaskResultSemantics.js';

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
});
