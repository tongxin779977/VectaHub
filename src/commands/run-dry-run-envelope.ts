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
  ok: boolean;
  dryRun: true;
  mode?: CliMode;
  result: RunDryRunResult;
  intent?: string;
  reply?: string;
  plan?: Record<string, unknown>;
  userReport?: Record<string, unknown>;
  steps?: Array<{ cli: string; args: string[] }>;
  workflow?: {
    name: string;
    steps: Array<{ cli: string; args: string[] }>;
  };
  dispatch?: RunDispatchResult;
}

export function buildReplyEnvelope(reply: string, intent?: string): RunDryRunEnvelope {
  return {
    ok: true,
    dryRun: true,
    result: { kind: 'reply', reply },
    reply,
    ...(intent !== undefined ? { intent } : {}),
  };
}

export function buildClarifyEnvelope(
  reason: string,
  dispatch?: RunDispatchResult,
): RunDryRunEnvelope {
  return {
    ok: true,
    dryRun: true,
    result: {
      kind: 'clarify',
      reason,
      suggestedAction: dispatch?.suggestedAction,
    },
    ...(dispatch ? { dispatch } : {}),
  };
}

export function buildBlockedEnvelope(
  reason: string,
  dispatch: RunDispatchResult,
): RunDryRunEnvelope {
  return {
    ok: false,
    dryRun: true,
    result: {
      kind: 'blocked',
      reason,
      suggestedAction: dispatch.suggestedAction,
    },
    dispatch,
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
    ok: true,
    dryRun: true,
    ...(mode ? { mode } : {}),
    result: {
      kind: 'plan',
      plan: planData,
      userReport,
    },
    plan: planData,
    userReport,
    ...(intent !== undefined ? { intent } : {}),
  };
}

export function buildWorkflowDraftEnvelope(
  workflow: { name: string; steps: Array<{ cli: string; args: string[] }> },
  mode?: CliMode,
): RunDryRunEnvelope {
  return {
    ok: true,
    dryRun: true,
    ...(mode ? { mode } : {}),
    result: {
      kind: 'workflow_draft',
      workflow,
    },
    workflow,
  };
}

export function buildStepsEnvelope(
  steps: Array<{ cli: string; args: string[] }>,
  mode?: CliMode,
): RunDryRunEnvelope {
  return {
    ok: true,
    dryRun: true,
    ...(mode ? { mode } : {}),
    result: {
      kind: 'workflow_draft',
      workflow: { name: 'nl-generated', steps },
    },
    steps,
  };
}
