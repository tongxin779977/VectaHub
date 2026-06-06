import { describe, expect, it } from 'vitest';

import {
  RunTaskReviewFindingSeverity,
  RunTaskReviewStatus,
  createRunTaskReviewReport,
  type RunTaskReviewInput,
} from './run-task-review.js';

function createInput(
  overrides: Partial<RunTaskReviewInput> = {},
): RunTaskReviewInput {
  return {
    taskId: 'RTK-003B',
    taskLabel: 'Implement deterministic run-task review pure function.',
    allowedFiles: [
      'src/commands/run-task-review.ts',
      'src/commands/run-task-review.test.ts',
    ],
    forbiddenFiles: [
      'src/commands/run-task.ts',
      'src/commands/run-task.test.ts',
    ],
    changedFiles: ['src/commands/run-task-review.ts'],
    validationPassed: true,
    agentExecutionOutcome: 'implemented',
    alreadySatisfied: false,
    ...overrides,
  };
}

describe('createRunTaskReviewReport', () => {
  it('returns PASS when only allowed files changed and validation passed', () => {
    const report = createRunTaskReviewReport(createInput());

    expect(report.status).toBe(RunTaskReviewStatus.PASS);
    expect(report.needsHumanReview).toBe(false);
    expect(report.findings).toEqual([]);
  });

  it('returns FAIL when a forbidden file changed', () => {
    const report = createRunTaskReviewReport(createInput({
      changedFiles: ['src/commands/run-task.ts'],
    }));

    expect(report.status).toBe(RunTaskReviewStatus.FAIL);
    expect(report.needsHumanReview).toBe(false);
    expect(report.findings).toEqual([
      expect.objectContaining({
        severity: RunTaskReviewFindingSeverity.error,
        code: 'FORBIDDEN_FILE_CHANGED',
        evidence: 'src/commands/run-task.ts',
      }),
      expect.objectContaining({
        severity: RunTaskReviewFindingSeverity.error,
        code: 'OUT_OF_SCOPE_FILE_CHANGED',
        evidence: 'src/commands/run-task.ts',
      }),
    ]);
  });

  it('returns FAIL when an out-of-scope file changed', () => {
    const report = createRunTaskReviewReport(createInput({
      changedFiles: ['src/commands/other.ts'],
    }));

    expect(report.status).toBe(RunTaskReviewStatus.FAIL);
    expect(report.findings).toEqual([
      expect.objectContaining({
        severity: RunTaskReviewFindingSeverity.error,
        code: 'OUT_OF_SCOPE_FILE_CHANGED',
        evidence: 'src/commands/other.ts',
      }),
    ]);
  });

  it('returns FAIL when validation did not pass', () => {
    const report = createRunTaskReviewReport(createInput({
      validationPassed: false,
    }));

    expect(report.status).toBe(RunTaskReviewStatus.FAIL);
    expect(report.findings).toContainEqual(expect.objectContaining({
      severity: RunTaskReviewFindingSeverity.error,
      code: 'VALIDATION_FAILED',
    }));
  });

  it('returns FAIL when agent execution outcome is planned only', () => {
    const report = createRunTaskReviewReport(createInput({
      agentExecutionOutcome: 'planned_only',
    }));

    expect(report.status).toBe(RunTaskReviewStatus.FAIL);
    expect(report.findings).toContainEqual(expect.objectContaining({
      severity: RunTaskReviewFindingSeverity.error,
      code: 'PLANNED_ONLY_OUTCOME',
    }));
  });

  it('returns FAIL when no files changed and task is not already satisfied', () => {
    const report = createRunTaskReviewReport(createInput({
      changedFiles: [],
      alreadySatisfied: false,
    }));

    expect(report.status).toBe(RunTaskReviewStatus.FAIL);
    expect(report.findings).toContainEqual(expect.objectContaining({
      severity: RunTaskReviewFindingSeverity.error,
      code: 'NO_CHANGES_RECORDED',
    }));
  });

  it('returns NEEDS_REVIEW when no files changed because task is already satisfied', () => {
    const report = createRunTaskReviewReport(createInput({
      changedFiles: [],
      alreadySatisfied: true,
    }));

    expect(report.status).toBe(RunTaskReviewStatus.NEEDS_REVIEW);
    expect(report.needsHumanReview).toBe(true);
    expect(report.findings).toEqual([
      expect.objectContaining({
        severity: RunTaskReviewFindingSeverity.info,
        code: 'ALREADY_SATISFIED',
      }),
    ]);
  });

  it('returns NEEDS_REVIEW when allowed files define a broad boundary', () => {
    const report = createRunTaskReviewReport(createInput({
      allowedFiles: ['src/commands/*.ts'],
    }));

    expect(report.status).toBe(RunTaskReviewStatus.NEEDS_REVIEW);
    expect(report.needsHumanReview).toBe(true);
    expect(report.findings).toEqual([
      expect.objectContaining({
        severity: RunTaskReviewFindingSeverity.warning,
        code: 'BROAD_ALLOWED_BOUNDARY',
        evidence: 'src/commands/*.ts',
      }),
    ]);
  });
});
