export type OrchestrationPlanStatus = 'draft' | 'needs_confirmation' | 'ready' | 'blocked' | 'executed';

export type OrchestrationPlanSource = 'run' | 'chat' | 'document' | 'manual';

export type OrchestrationTaskKind = 'reply' | 'inspect' | 'transform' | 'apply' | 'verify' | 'recover';

export type OrchestrationTaskExecutor = 'local' | 'workflow' | 'agent' | 'human';

export type OrchestrationDelegateTarget = 'codex' | 'claude' | 'gemini' | 'aider' | 'custom';

export type SideEffectLevel = 'none' | 'read' | 'write' | 'command' | 'network';

export type PlanConfidenceLevel = 'low' | 'medium' | 'high';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export type SafetyReviewStatus = 'not_reviewed' | 'safe' | 'needs_confirmation' | 'blocked';

export type SafetyFindingCategory = 'filesystem' | 'network' | 'command' | 'agent' | 'data' | 'unknown';

export type SafetyFindingAction = 'allow' | 'confirm' | 'block';

export type IntentRecognitionMethod = 'capability' | 'direct' | 'document' | 'manual';

export type PlanInputKind = 'text' | 'file' | 'artifact' | 'previous_output';

export type PlanOutputKind = 'text' | 'file' | 'artifact' | 'stdout' | 'report';

export interface CommandInvocation {
  cli: string;
  args: string[];
  cwd?: string;
  envPolicy?: 'inherit-safe' | 'explicit-only';
}

export interface PlanInputRef {
  kind: PlanInputKind;
  ref: string;
  required: boolean;
}

export interface PlanOutputRef {
  kind: PlanOutputKind;
  ref: string;
  required: boolean;
}

export interface OrchestrationTask {
  id: string;
  kind: OrchestrationTaskKind;
  title: string;
  description?: string;
  executor: OrchestrationTaskExecutor;
  command?: CommandInvocation;
  delegateTo?: OrchestrationDelegateTarget;
  dependsOn: string[];
  inputs: PlanInputRef[];
  outputs: PlanOutputRef[];
  sideEffect: SideEffectLevel;
  confidence: PlanConfidenceLevel;
  needsConfirmation: boolean;
  blockingReason?: string;
}

export interface SafetyFinding {
  taskId?: string;
  level: RiskLevel;
  category: SafetyFindingCategory;
  reason: string;
  requiredAction: SafetyFindingAction;
}

export interface PlanSafetyReview {
  status: SafetyReviewStatus;
  maxRiskLevel: RiskLevel;
  findings: SafetyFinding[];
  reviewedAt?: string;
}

export interface ConfirmationRequest {
  id: string;
  taskIds: string[];
  reason: string;
  prompt: string;
  defaultAction: 'deny' | 'allow';
}

export interface SemanticCheck {
  id: string;
  description: string;
  expectedMeaning: string;
}

export interface VerificationPlan {
  required: boolean;
  commands: CommandInvocation[];
  semanticChecks: SemanticCheck[];
  successCriteria: string[];
}

export interface WorkflowDraftSummary {
  draftId: string;
  stepCount: number;
  hasSideEffects: boolean;
  requiresConfirmation: boolean;
}

export interface PlanTraceLink {
  traceId?: string;
  auditEventIds: string[];
  executionId?: string;
}

export interface OrchestrationPlanMetadata {
  createdAt: string;
  cwd: string;
  intentRecognitionMethod: IntentRecognitionMethod;
  matchedCapability?: string;
  confidence?: number;
}

export interface OrchestrationPlan {
  schemaVersion: '1.0';
  planId: string;
  source: OrchestrationPlanSource;
  goal: string;
  status: OrchestrationPlanStatus;
  assumptions: string[];
  tasks: OrchestrationTask[];
  safetyReview: PlanSafetyReview;
  requiredConfirmations: ConfirmationRequest[];
  verification: VerificationPlan;
  workflowDraft?: WorkflowDraftSummary;
  trace?: PlanTraceLink;
  metadata: OrchestrationPlanMetadata;
}
