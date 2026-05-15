export type ConfirmationSource = 'preflight' | 'post-execution';
export type RiskEnforcement = 'blocked' | 'confirm_required';

export interface RunTaskResultLike {
  riskAssessment?: {
    needsConfirmation?: boolean;
    confirmationSource?: string;
    enforcement?: string;
  };
  gitChanges?: {
    changedFiles?: string[];
  };
  verification?: unknown;
}

export interface RunTaskExecutionSemantics {
  needsConfirmation: boolean;
  confirmationSource?: ConfirmationSource;
  enforcement?: RiskEnforcement;
  unclosedExecution: boolean;
}

function toConfirmationSource(value: string | undefined): ConfirmationSource | undefined {
  if (value === 'preflight' || value === 'post-execution') {
    return value;
  }
  return undefined;
}

function toRiskEnforcement(value: string | undefined): RiskEnforcement | undefined {
  if (value === 'blocked' || value === 'confirm_required') {
    return value;
  }
  return undefined;
}

export function resolveRunTaskExecutionSemantics(input: {
  ok: boolean;
  data?: RunTaskResultLike;
}): RunTaskExecutionSemantics {
  const enforcement = toRiskEnforcement(input.data?.riskAssessment?.enforcement);
  const needsConfirmation = enforcement
    ? enforcement === 'confirm_required'
    : input.data?.riskAssessment?.needsConfirmation === true;
  const confirmationSource = needsConfirmation
    ? toConfirmationSource(input.data?.riskAssessment?.confirmationSource)
    : undefined;
  const changedFileCount = input.data?.gitChanges?.changedFiles?.length ?? 0;
  const hasVerification = input.data?.verification !== undefined;
  const unclosedExecution = input.ok === false && changedFileCount > 0 && !hasVerification;

  return {
    needsConfirmation,
    confirmationSource,
    enforcement,
    unclosedExecution,
  };
}
