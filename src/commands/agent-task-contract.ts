import {
  computeInstructionHash as sharedComputeInstructionHash,
  deriveAgentTaskBoundary as sharedDeriveAgentTaskBoundary,
  deriveDocExcerptFromLines as sharedDeriveDocExcerptFromLines,
  deriveValidationCommands as sharedDeriveValidationCommands,
  normalizeAgentTaskFiles as sharedNormalizeAgentTaskFiles,
  decideAgentTaskConcurrency as sharedDecideAgentTaskConcurrency,
} from '@vectahub/doc-task-contract-core';
import type { AgentTaskBoundary, AgentTaskConcurrencyDecision, AgentTaskContract } from '../types/doc-task.js';
import { type InfrastructureContext } from '../infrastructure/context.js';

export function computeInstructionHash(
  taskId: string,
  label: string,
  docExcerpt: string,
  tool?: string,
  allowedFiles?: string[],
  forbiddenFiles?: string[],
  globalConfigDigest?: string,
): string {
  return sharedComputeInstructionHash({
    taskId,
    label,
    docExcerpt,
    tool,
    allowedFiles,
    forbiddenFiles,
    globalConfigDigest,
  });
}

export async function deriveDocExcerpt(
  context: InfrastructureContext,
  input: {
    docPath: string;
    taskId: string;
    label: string;
    maxChars?: number;
  },
): Promise<{
  excerpt: string;
  truncated: boolean;
  strategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback';
}> {
  const lineIterator = context.environment.readLines(input.docPath);
  
  return await sharedDeriveDocExcerptFromLines(lineIterator, {
    taskId: input.taskId,
    label: input.label,
    maxChars: input.maxChars,
  });
}

export function normalizeAgentTaskFiles(input: {
  files: string[];
  projectRoot: string;
}): string[] {
  return sharedNormalizeAgentTaskFiles(input);
}

export function deriveValidationCommands(input: {
  allowedFiles: string[];
  taskLabel: string;
  packageScripts?: string[];
}): string[] {
  return sharedDeriveValidationCommands(input);
}

export function deriveAgentTaskBoundary(input: {
  docExcerpt: string;
  label: string;
  projectRoot: string;
  packageScripts?: string[];
}): AgentTaskBoundary {
  return sharedDeriveAgentTaskBoundary({
    docExcerpt: input.docExcerpt,
    label: input.label,
    projectRoot: input.projectRoot,
    packageScripts: input.packageScripts,
  });
}

export function decideAgentTaskConcurrency(contracts: AgentTaskContract[]): AgentTaskConcurrencyDecision {
  return sharedDecideAgentTaskConcurrency(contracts.map(contract => ({
    taskId: contract.taskId,
    label: contract.label,
    allowedFiles: contract.allowedFiles,
    forbiddenFiles: contract.forbiddenFiles,
    boundaryConfidence: contract.boundaryConfidence,
    executionMode: contract.executionMode,
  })));
}
