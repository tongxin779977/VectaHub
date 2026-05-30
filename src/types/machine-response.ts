import type { OrchestrationPlan } from './orchestration-plan.js';
import type { WorkflowDraft } from './workflow-draft.js';

export type MachineResponseKind =
  | 'success'
  | 'reply'
  | 'clarify'
  | 'blocked'
  | 'validation_error'
  | 'safety_error'
  | 'internal_error'
  | 'plan'
  | 'workflow_draft';

export interface MachineResponseSuccess {
  kind: 'success';
  message: string;
}

export interface MachineResponseReply {
  kind: 'reply';
  reply: string;
}

export interface MachineResponseClarify {
  kind: 'clarify';
  reason: string;
  suggestedAction?: string;
}

export interface MachineResponseBlocked {
  kind: 'blocked';
  reason: string;
  blockedBy?: 'safety' | 'validation' | 'contract' | 'unknown';
  suggestedAction?: string;
}

export interface MachineResponseValidationError {
  kind: 'validation_error';
  reason: string;
  validationErrors: string[];
  suggestedAction?: string;
}

export interface MachineResponseSafetyError {
  kind: 'safety_error';
  reason: string;
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  suggestedAction?: string;
}

export interface MachineResponseInternalError {
  kind: 'internal_error';
  reason: string;
  errorId?: string;
  suggestedAction?: string;
}

export interface MachineResponsePlan {
  kind: 'plan';
  plan: OrchestrationPlan;
}

export interface MachineResponseWorkflowDraft {
  kind: 'workflow_draft';
  workflowDraft: WorkflowDraft;
}

export type MachineResponseResult =
  | MachineResponseSuccess
  | MachineResponseReply
  | MachineResponseClarify
  | MachineResponseBlocked
  | MachineResponseValidationError
  | MachineResponseSafetyError
  | MachineResponseInternalError
  | MachineResponsePlan
  | MachineResponseWorkflowDraft;

export interface MachineResponseEnvelope {
  schemaVersion: '1.0';
  ok: boolean;
  result: MachineResponseResult;
  requestId?: string;
  intent?: string;
  reply?: string;
  timestamp: string;
}
