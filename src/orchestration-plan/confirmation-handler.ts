
import type {
  OrchestrationPlan,
} from '../types/orchestration-plan.js';
import type {
  WorkflowDraft,
  DraftConfirmation,
} from '../types/workflow-draft.js';

export interface ConfirmationDecision {
  confirmedTaskIds: string[];
  deniedTaskIds: string[];
}

export interface ApplyConfirmationOptions {
  confirmedBy?: 'user' | 'non_interactive_policy';
}

/**
 * Apply confirmation to an OrchestrationPlan
 */
export function applyConfirmationToPlan(
  plan: OrchestrationPlan,
  decision: ConfirmationDecision,
  _options: ApplyConfirmationOptions = {}
): OrchestrationPlan {
  const updatedPlan = { ...plan };
  
  // Check if all required confirmations are addressed
  const allRequiredTaskIds = new Set<string>();
  for (const req of plan.requiredConfirmations) {
    for (const id of req.taskIds) {
      allRequiredTaskIds.add(id);
    }
  }
  
  const confirmedAll = [...allRequiredTaskIds].every(
    (id) => decision.confirmedTaskIds.includes(id)
  );
  
  const anyDenied = decision.deniedTaskIds.length > 0;
  
  if (anyDenied) {
    updatedPlan.status = 'blocked';
  } else if (confirmedAll) {
    updatedPlan.status = 'ready';
  }
  
  return updatedPlan;
}

/**
 * Apply confirmation to a WorkflowDraft
 */
export function applyConfirmationToDraft(
  draft: WorkflowDraft,
  decision: ConfirmationDecision,
  options: ApplyConfirmationOptions = {}
): WorkflowDraft {
  const updatedDraft = { ...draft };
  
  const confirmation: DraftConfirmation = {
    confirmedAt: new Date().toISOString(),
    confirmedBy: options.confirmedBy || 'user',
    confirmedTaskIds: decision.confirmedTaskIds,
    deniedTaskIds: decision.deniedTaskIds,
  };
  
  updatedDraft.confirmation = confirmation;
  
  const anyDenied = decision.deniedTaskIds.length > 0;
  
  if (anyDenied) {
    updatedDraft.status = 'cancelled';
  } else if (
    draft.safetyReview.status === 'safe' ||
    draft.safetyReview.status === 'needs_confirmation'
  ) {
    updatedDraft.status = 'confirmed';
  }
  
  return updatedDraft;
}

/**
 * Apply non-interactive deny policy (default behavior for non-interactive mode)
 */
export function applyNonInteractiveDenyToPlan(
  plan: OrchestrationPlan
): OrchestrationPlan {
  const updatedPlan = { ...plan };
  
  const decision: ConfirmationDecision = {
    confirmedTaskIds: [],
    deniedTaskIds: plan.requiredConfirmations.flatMap((req) => req.taskIds),
  };
  
  return applyConfirmationToPlan(updatedPlan, decision, {
    confirmedBy: 'non_interactive_policy',
  });
}

/**
 * Apply non-interactive deny policy to WorkflowDraft
 */
export function applyNonInteractiveDenyToDraft(
  draft: WorkflowDraft
): WorkflowDraft {
  const allStepTaskIds = draft.steps.map((s) => s.sourceTaskId);
  
  const decision: ConfirmationDecision = {
    confirmedTaskIds: [],
    deniedTaskIds: allStepTaskIds,
  };
  
  return applyConfirmationToDraft(draft, decision, {
    confirmedBy: 'non_interactive_policy',
  });
}
