import type { Workflow, ExecutionRecord } from '../types/workflow.js';
import { hashObject } from './hash.js';

export interface HashGuardResult {
  valid: boolean;
  reason?: string;
}

export function computeWorkflowHash(workflow: Workflow): string {
  const workflowStructure = {
    steps: workflow.steps.map((s) => {
      return {
        id: s.id,
        type: s.type,
        cli: s.cli,
        args: s.args,
        delegateTo: s.delegateTo,
        delegatePrompt: s.delegatePrompt,
        dependsOn: s.dependsOn,
      };
    }),
  };
  return hashObject(workflowStructure);
}

export function validateWorkflowHash(
  currentWorkflow: Workflow,
  executionRecord: ExecutionRecord
): HashGuardResult {
  const currentHash = computeWorkflowHash(currentWorkflow);
  const storedHash = executionRecord.workflowHash;

  if (!storedHash) {
    return {
      valid: false,
      reason: 'No workflow hash stored in execution record',
    };
  }

  if (currentHash !== storedHash) {
    return {
      valid: false,
      reason: 'Workflow definition has changed',
    };
  }

  return { valid: true };
}
