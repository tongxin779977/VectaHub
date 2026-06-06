import type { DocTaskFailureKind } from '../project/docTaskState.js';

export type ConfirmationSource = 'preflight' | 'post-execution';
export type RiskEnforcement = 'blocked' | 'confirm_required';

export interface RunTaskResultLike {
  diagnostics?: {
    failureKind?: string;
    riskAssessment?: {
      needsConfirmation?: boolean;
      confirmationSource?: string;
      enforcement?: string;
    };
    gitChanges?: {
      changedFiles?: string[];
    };
    verification?: unknown;
    unclosedExecution?: boolean;
  };
  failureKind?: string;
  riskAssessment?: {
    needsConfirmation?: boolean;
    confirmationSource?: string;
    enforcement?: string;
  };
  gitChanges?: {
    changedFiles?: string[];
  };
  verification?: unknown;
  unclosedExecution?: boolean;
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
  const diagnostics = input.data?.diagnostics;
  const enforcement = toRiskEnforcement(diagnostics?.riskAssessment?.enforcement || input.data?.riskAssessment?.enforcement);
  const needsConfirmation = enforcement
    ? enforcement === 'confirm_required'
    : (diagnostics?.riskAssessment?.needsConfirmation === true || input.data?.riskAssessment?.needsConfirmation === true);
  const confirmationSource = needsConfirmation
    ? toConfirmationSource(diagnostics?.riskAssessment?.confirmationSource || input.data?.riskAssessment?.confirmationSource)
    : undefined;
  const changedFileCount = diagnostics?.gitChanges?.changedFiles?.length ?? input.data?.gitChanges?.changedFiles?.length ?? 0;
  const hasVerification = diagnostics?.verification !== undefined || input.data?.verification !== undefined;
  const unclosedExecution = diagnostics?.unclosedExecution === true || input.data?.unclosedExecution === true
    ? true
    : input.ok === false && changedFileCount > 0 && !hasVerification;

  return {
    needsConfirmation,
    confirmationSource,
    enforcement,
    unclosedExecution,
  };
}

export function resolveRunTaskFailureKind(input: {
  data?: RunTaskResultLike;
}): DocTaskFailureKind | undefined {
  const failureKind = input.data?.diagnostics?.failureKind || input.data?.failureKind;
  if (!failureKind) {
    return undefined;
  }
  return failureKind as DocTaskFailureKind;
}
