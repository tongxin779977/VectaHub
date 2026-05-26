export const RunTaskReviewStatus = {
  PASS: 'PASS',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  FAIL: 'FAIL',
} as const;

export type RunTaskReviewStatus =
  typeof RunTaskReviewStatus[keyof typeof RunTaskReviewStatus];

export const RunTaskReviewFindingSeverity = {
  info: 'info',
  warning: 'warning',
  error: 'error',
} as const;

export type RunTaskReviewFindingSeverity =
  typeof RunTaskReviewFindingSeverity[keyof typeof RunTaskReviewFindingSeverity];

export interface RunTaskReviewFinding {
  severity: RunTaskReviewFindingSeverity;
  code: string;
  message: string;
  evidence?: string;
}

export interface RunTaskReviewInput {
  taskId: string;
  taskLabel: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  changedFiles: string[];
  validationPassed: boolean;
  agentExecutionOutcome: 'implemented' | 'planned_only';
  alreadySatisfied?: boolean;
}

export interface RunTaskReviewReport {
  taskId: string;
  taskLabel: string;
  status: RunTaskReviewStatus;
  changedFiles: string[];
  validationPassed: boolean;
  findings: RunTaskReviewFinding[];
  needsHumanReview: boolean;
}

const BROAD_BOUNDARY_PATTERNS = ['*', '?', '[', ']', '{', '}'];

function isBroadAllowedFileBoundary(filePath: string): boolean {
  return (
    filePath.endsWith('/') ||
    filePath.endsWith('/**') ||
    filePath.includes('/**/') ||
    filePath.includes('\\') ||
    BROAD_BOUNDARY_PATTERNS.some((pattern) => filePath.includes(pattern))
  );
}

function createFinding(
  severity: RunTaskReviewFindingSeverity,
  code: string,
  message: string,
  evidence?: string,
): RunTaskReviewFinding {
  return {
    severity,
    code,
    message,
    evidence,
  };
}

export function createRunTaskReviewReport(
  input: RunTaskReviewInput,
): RunTaskReviewReport {
  const findings: RunTaskReviewFinding[] = [];
  const allowedFiles = new Set(input.allowedFiles);
  const forbiddenFiles = new Set(input.forbiddenFiles);
  const changedFiles = [...input.changedFiles];
  const broadBoundary = input.allowedFiles.find(isBroadAllowedFileBoundary);

  if (broadBoundary) {
    findings.push(
      createFinding(
        RunTaskReviewFindingSeverity.warning,
        'BROAD_ALLOWED_BOUNDARY',
        'Allowed files must stay file-scoped for deterministic review.',
        broadBoundary,
      ),
    );
  }

  for (const changedFile of changedFiles) {
    if (forbiddenFiles.has(changedFile)) {
      findings.push(
        createFinding(
          RunTaskReviewFindingSeverity.error,
          'FORBIDDEN_FILE_CHANGED',
          'Changed files include a forbidden path.',
          changedFile,
        ),
      );
    }
  }

  if (!broadBoundary) {
    for (const changedFile of changedFiles) {
      if (!allowedFiles.has(changedFile)) {
        findings.push(
          createFinding(
            RunTaskReviewFindingSeverity.error,
            'OUT_OF_SCOPE_FILE_CHANGED',
            'Changed files must stay within allowed files.',
            changedFile,
          ),
        );
      }
    }
  }

  if (!input.validationPassed) {
    findings.push(
      createFinding(
        RunTaskReviewFindingSeverity.error,
        'VALIDATION_FAILED',
        'Validation must pass before review can pass.',
      ),
    );
  }

  if (input.agentExecutionOutcome === 'planned_only') {
    findings.push(
      createFinding(
        RunTaskReviewFindingSeverity.error,
        'PLANNED_ONLY_OUTCOME',
        'Planned-only execution outcome cannot pass review.',
      ),
    );
  }

  if (changedFiles.length === 0) {
    if (input.alreadySatisfied === true) {
      findings.push(
        createFinding(
          RunTaskReviewFindingSeverity.info,
          'ALREADY_SATISFIED',
          'No file changes were required because the task was already satisfied.',
        ),
      );
    } else {
      findings.push(
        createFinding(
          RunTaskReviewFindingSeverity.error,
          'NO_CHANGES_RECORDED',
          'At least one allowed file must change unless the task is already satisfied.',
        ),
      );
    }
  }

  const hasBlockingFailure = findings.some(
    (finding) => finding.severity === RunTaskReviewFindingSeverity.error,
  );
  const needsHumanReview = findings.some(
    (finding) => finding.severity !== RunTaskReviewFindingSeverity.error,
  );

  return {
    taskId: input.taskId,
    taskLabel: input.taskLabel,
    status: hasBlockingFailure
      ? RunTaskReviewStatus.FAIL
      : needsHumanReview
        ? RunTaskReviewStatus.NEEDS_REVIEW
        : RunTaskReviewStatus.PASS,
    changedFiles,
    validationPassed: input.validationPassed,
    findings,
    needsHumanReview: !hasBlockingFailure && needsHumanReview,
  };
}
