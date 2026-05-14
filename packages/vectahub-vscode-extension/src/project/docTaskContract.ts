import {
  deriveAgentTaskBoundary,
  deriveDocExcerptFromTextSync,
  decideAgentTaskConcurrency,
} from '@vectahub/doc-task-contract-core';
import type { AgentTaskContractSummary, AgentTaskRunContractSummary, DocTaskConcurrencyDecision, DocTaskContractInput } from './docTaskContractTypes.js';
export type { AgentTaskContractSummary, AgentTaskRunContractSummary, DocTaskConcurrencyDecision, DocTaskContractInput } from './docTaskContractTypes.js';

export function buildAgentTaskContractSummaries(input: {
  tasks: DocTaskContractInput[];
  docContent?: string;
  projectRoot: string;
}): Map<string, AgentTaskContractSummary> {
  const result = new Map<string, AgentTaskContractSummary>();
  for (const task of input.tasks) {
    const excerpt = input.docContent
      ? deriveDocExcerptFromTextSync(input.docContent, { taskId: task.id, label: task.label })
      : { excerpt: '', truncated: false, strategy: 'none' as const };
    const boundary = deriveAgentTaskBoundary({
      docExcerpt: excerpt.excerpt,
      label: task.label,
      projectRoot: input.projectRoot,
    });
    result.set(task.id, {
      boundaryConfidence: boundary.boundaryConfidence,
      allowedFiles: boundary.allowedFiles,
      forbiddenFiles: boundary.forbiddenFiles,
      validationCommands: boundary.validationCommands,
      executionMode: boundary.parallelEligible ? 'parallel-eligible' : 'serial',
      docExcerptTruncated: excerpt.truncated,
      excerptStrategy: excerpt.strategy,
    });
  }
  return result;
}

export function deriveDocExcerptForTask(input: {
  docContent?: string;
  taskId: string;
  label: string;
}): {
  excerpt: string;
  truncated: boolean;
  strategy: AgentTaskContractSummary['excerptStrategy'];
} {
  if (!input.docContent) {
    return { excerpt: '', truncated: false, strategy: 'none' };
  }
  return deriveDocExcerptFromTextSync(input.docContent, { taskId: input.taskId, label: input.label });
}

export function decideDocTaskBatchConcurrency(input: {
  contracts: Map<string, AgentTaskContractSummary>;
  requestedMaxConcurrent: number;
}): DocTaskConcurrencyDecision {
  const summaries = [...input.contracts.values()];
  const requested = Math.max(1, Math.trunc(input.requestedMaxConcurrent || 1));
  if (summaries.some(contract => contract.boundaryConfidence !== 'medium' && contract.boundaryConfidence !== 'high')) {
    return { mode: 'serial', reason: 'unknown-boundary', effectiveMaxConcurrent: 1 };
  }
  if (summaries.some(contract => contract.allowedFiles.length === 0)) {
    return { mode: 'serial', reason: 'unknown-boundary', effectiveMaxConcurrent: 1 };
  }
  const contracts = [...input.contracts.entries()].map(([taskId, summary]) => ({
    taskId,
    label: taskId,
    allowedFiles: summary.allowedFiles,
    forbiddenFiles: summary.forbiddenFiles,
    boundaryConfidence: summary.boundaryConfidence,
    executionMode: summary.executionMode,
  }));
  const decision = decideAgentTaskConcurrency(contracts);
  if (decision.mode === 'serial' || contracts.length <= 1 || requested <= 1) {
    return {
      mode: 'serial',
      reason: contracts.length <= 1 || requested <= 1 ? 'insufficient-parallelism' : decision.reason,
      effectiveMaxConcurrent: 1,
    };
  }
  return { mode: 'parallel', reason: decision.reason, effectiveMaxConcurrent: requested };
}

export function toRunContractSummary(summary: AgentTaskContractSummary | undefined): AgentTaskRunContractSummary | undefined {
  if (!summary) return undefined;
  return {
    boundaryConfidence: summary.boundaryConfidence,
    allowedFileCount: summary.allowedFiles.length,
    forbiddenFileCount: summary.forbiddenFiles.length,
    validationCommandCount: summary.validationCommands.length,
    executionMode: summary.executionMode,
  };
}
