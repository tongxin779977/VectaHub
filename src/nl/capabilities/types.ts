import type { ParsedGoal, ProjectContext } from '../core/goal-types.js';

export interface CapabilityMatch {
  capabilityId: string;
  score: number;
  reason: string;
}

export interface Capability {
  id: string;
  canHandle(goal: ParsedGoal, context?: ProjectContext): CapabilityMatch;
  plan(goal: ParsedGoal, context?: ProjectContext): ExecutionPlan;
}

export interface ExecutionPlanStep {
  id: string;
  label: string;
  type: 'workflow' | 'command' | 'internal';
  command?: { cli: string; args: string[] };
  workflowFile?: string;
  outputVar?: string;
  internalOutput?: boolean;
}

export interface ExecutionPlan {
  id: string;
  label: string;
  capabilityId: string;
  goal: ParsedGoal;
  steps: ExecutionPlanStep[];
  userReport: {
    summaryTemplate: string;
    nextActions?: string[];
    verificationSteps?: string[];
  };
}

export interface RouterResult {
  plan: ExecutionPlan | null;
  route: 'auto' | 'preview' | 'fallback' | 'clarify';
  matchedCapability?: string;
  score?: number;
  reason: string;
}

export interface CapabilityRouter {
  route(goal: ParsedGoal, context?: ProjectContext): RouterResult;
}
