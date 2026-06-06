
import type { WorkflowDraft, WorkflowDraftStep, DraftVerification } from '../types/workflow-draft.js';
import type { Workflow, Step, ExecutionRecord } from '../types/workflow.js';
import type { WorkflowEngine, ExecuteOptions } from '../workflow/engine.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { VerificationPlan } from '../types/index.js';
import { validateWorkflowDraft } from './workflow-draft-validator.js';
import { runVerificationPlan } from './verification-runner.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { computeWorkflowHash } from './workflow-hash-guard.js';

export interface DraftExecutionOptions {
  dryRun?: boolean;
  mode?: 'strict' | 'relaxed' | 'consensus';
  onProgress?: (info: { currentStep: number; totalSteps: number; stepId: string; stepType: string; status: 'starting' | 'completed' | 'failed' }) => void;
  initialVariables?: Record<string, unknown>;
  sessionId?: string;
  traceId?: string;
}

export interface DraftExecutionResult {
  executionRecord: ExecutionRecord;
  verificationResults?: Awaited<ReturnType<typeof runVerificationPlan>>;
}

export interface DraftExecutorDeps {
  context: InfrastructureContext;
  workflowEngine?: WorkflowEngine;
}

/**
 * 将 DraftVerification 转换为 VerificationPlan
 */
function convertDraftVerificationToVerificationPlan(draftVerification: DraftVerification): VerificationPlan {
  return {
    required: draftVerification.required,
    commands: draftVerification.commands,
    semanticChecks: [],
    successCriteria: draftVerification.successCriteria,
  };
}

/**
 * 将 WorkflowDraftStep 转换为 Step（用于 workflow engine）
 */
function convertDraftStepToWorkflowStep(draftStep: WorkflowDraftStep): Step {
  const step: Step = {
    id: draftStep.id,
    type: draftStep.type,
    dependsOn: draftStep.dependsOn.length > 0 ? draftStep.dependsOn : undefined,
    outputVar: draftStep.outputVar,
  };

  if (draftStep.command) {
    step.cli = draftStep.command.cli;
    step.args = draftStep.command.args;
  }

  if (draftStep.delegate) {
    step.delegateTo = draftStep.delegate.to;
    step.delegatePrompt = draftStep.delegate.prompt;
  }

  return step;
}

/**
 * 将 WorkflowDraft 转换为 Workflow
 */
function convertDraftToWorkflow(draft: WorkflowDraft): Workflow {
  const steps = draft.steps.map(convertDraftStepToWorkflowStep);
  
  return {
    id: `wf-from-draft-${draft.draftId}`,
    name: draft.name,
    mode: draft.mode,
    steps,
    createdAt: new Date(),
  };
}

/**
 * 验证 draft 是否可以执行
 */
function validateDraftForExecution(draft: WorkflowDraft): { valid: true } | { valid: false; reason: string } {
  // 检查状态
  if (draft.status !== 'confirmed' && draft.status !== 'persisted') {
    return { valid: false, reason: `Draft status is ${draft.status}, must be 'confirmed' or 'persisted'` };
  }

  // 检查安全审查
  if (draft.safetyReview.status !== 'safe') {
    if (draft.safetyReview.status === 'needs_confirmation' && !draft.confirmation) {
      return { valid: false, reason: 'Draft needs confirmation but no confirmation record found' };
    }
    if (draft.safetyReview.status === 'blocked') {
      return { valid: false, reason: 'Draft is blocked by safety review' };
    }
    if (draft.safetyReview.status === 'not_reviewed') {
      return { valid: false, reason: 'Draft safety review is not reviewed' };
    }
  }

  // 验证 draft 结构
  const validation = validateWorkflowDraft(draft);
  if (!validation.valid) {
    return { valid: false, reason: `Draft validation failed: ${validation.errors.map(e => e.message).join(', ')}` };
  }

  return { valid: true };
}

export function createDraftExecutor(deps: DraftExecutorDeps) {
  const workflowEngine = deps.workflowEngine ?? createWorkflowEngine({
    audit: deps.context.audit.getHelper(),
    environment: deps.context.environment,
    logger: deps.context.logger.getLogger(),
  });

  async function executeConfirmedDraft(
    draft: WorkflowDraft,
    options: DraftExecutionOptions = {}
  ): Promise<DraftExecutionResult> {
    // 首先验证 draft 是否可以执行
    const validation = validateDraftForExecution(draft);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    // 转换为 workflow
    const workflow = convertDraftToWorkflow(draft);

    // 执行 workflow
    const executeOptions: ExecuteOptions = {
      dryRun: options.dryRun,
      mode: options.mode ?? draft.mode,
      onProgress: options.onProgress,
      initialVariables: options.initialVariables,
      sessionId: options.sessionId,
    };

    const workflowHash = computeWorkflowHash(workflow);
    const executionRecord = await workflowEngine.execute(workflow, executeOptions);
    executionRecord.workflowHash = workflowHash;

    // 关联 trace 信息
    executionRecord.traceId = options.traceId ?? draft.trace?.traceId;
    executionRecord.planId = draft.planId;
    executionRecord.draftId = draft.draftId;

    // 如果需要验证，运行验证
    let verificationResults;
    if (draft.verification.required && !options.dryRun) {
      const verificationPlan = convertDraftVerificationToVerificationPlan(draft.verification);
      verificationResults = await runVerificationPlan({
        planId: draft.planId,
        verificationPlan,
        cwd: draft.metadata.cwd,
        context: deps.context,
      });
    }

    return {
      executionRecord,
      verificationResults,
    };
  }

  return {
    executeConfirmedDraft,
    convertDraftToWorkflow,
    validateDraftForExecution,
  };
}

export type DraftExecutor = ReturnType<typeof createDraftExecutor>;
