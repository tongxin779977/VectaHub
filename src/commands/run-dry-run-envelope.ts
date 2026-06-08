import type { ExecutionPlan } from '../nl/capabilities/types.js';
import type { RunDispatchResult } from './run-dispatch.js';
import { formatJsonReport } from '../nl/capabilities/user-report.js';

export type CliMode = 'strict' | 'relaxed' | 'consensus';

const MODE_DESCRIPTIONS: Record<CliMode, string> = {
  strict: '严格模式：步骤失败时立即停止；危险命令（critical/high）将被阻止',
  relaxed: '宽松模式：步骤失败后继续执行；high 级别危险命令允许，critical 阻止',
  consensus: '共识模式：步骤失败后继续执行；所有危险命令需共识确认才允许',
};

export function getModeDescription(mode: CliMode): string {
  return MODE_DESCRIPTIONS[mode];
}

export type RunDryRunResultKind = 'reply' | 'clarify' | 'blocked' | 'plan' | 'workflow_draft';

export interface RunDryRunResultReply {
  kind: 'reply';
  reply: string;
}

export interface RunDryRunResultClarify {
  kind: 'clarify';
  reason: string;
  suggestedAction?: string;
}

export interface RunDryRunResultBlocked {
  kind: 'blocked';
  reason: string;
  suggestedAction?: string;
}

export interface RunDryRunResultPlan {
  kind: 'plan';
  plan: Record<string, unknown>;
  userReport: Record<string, unknown>;
}

export interface RunDryRunResultWorkflowDraft {
  kind: 'workflow_draft';
  workflow: {
    name: string;
    steps: Array<{ cli: string; args: string[] }>;
  };
}

export type RunDryRunResult =
  | RunDryRunResultReply
  | RunDryRunResultClarify
  | RunDryRunResultBlocked
  | RunDryRunResultPlan
  | RunDryRunResultWorkflowDraft;

export interface RunDryRunEnvelope {
  schemaVersion: '1.0';
  ok: boolean;
  dryRun: true;
  mode?: CliMode;
  result: RunDryRunResult;
  intent?: string;
  dispatch?: RunDispatchResult;
  timestamp: string;
}

export function buildReplyEnvelope(reply: string, intent?: string): RunDryRunEnvelope {
  return {
    schemaVersion: '1.0',
    ok: true,
    dryRun: true,
    result: { kind: 'reply', reply },
    ...(intent !== undefined ? { intent } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function buildClarifyEnvelope(
  reason: string,
  dispatch?: RunDispatchResult,
): RunDryRunEnvelope {
  return {
    schemaVersion: '1.0',
    ok: true,
    dryRun: true,
    result: {
      kind: 'clarify',
      reason,
      suggestedAction: dispatch?.suggestedAction,
    },
    ...(dispatch ? { dispatch } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function buildBlockedEnvelope(
  reason: string,
  dispatch: RunDispatchResult,
): RunDryRunEnvelope {
  return {
    schemaVersion: '1.0',
    ok: false,
    dryRun: true,
    result: {
      kind: 'blocked',
      reason,
      suggestedAction: dispatch.suggestedAction,
    },
    dispatch,
    timestamp: new Date().toISOString(),
  };
}

export function buildPlanEnvelope(
  plan: ExecutionPlan,
  intent?: string,
  mode?: CliMode,
): RunDryRunEnvelope {
  const report = formatJsonReport(plan);
  const planData = report.plan as Record<string, unknown>;
  const userReport = report.userReport as Record<string, unknown>;
  return {
    schemaVersion: '1.0',
    ok: true,
    dryRun: true,
    ...(mode ? { mode } : {}),
    result: {
      kind: 'plan',
      plan: planData,
      userReport,
    },
    ...(intent !== undefined ? { intent } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function buildWorkflowDraftEnvelope(
  workflow: { name: string; steps: Array<{ cli: string; args: string[] }> },
  mode?: CliMode,
): RunDryRunEnvelope {
  return {
    schemaVersion: '1.0',
    ok: true,
    dryRun: true,
    ...(mode ? { mode } : {}),
    result: {
      kind: 'workflow_draft',
      workflow,
    },
    timestamp: new Date().toISOString(),
  };
}

export function buildStepsEnvelope(
  steps: Array<{ cli: string; args: string[] }>,
  mode?: CliMode,
): RunDryRunEnvelope {
  return {
    schemaVersion: '1.0',
    ok: true,
    dryRun: true,
    ...(mode ? { mode } : {}),
    result: {
      kind: 'workflow_draft',
      workflow: { name: 'nl-generated', steps },
    },
    timestamp: new Date().toISOString(),
  };
}
