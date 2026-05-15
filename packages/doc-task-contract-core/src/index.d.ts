export interface ComputeInstructionHashInput {
  taskId: string;
  label: string;
  docExcerpt: string;
  tool?: string;
  allowedFiles?: string[];
  forbiddenFiles?: string[];
  globalConfigDigest?: string;
}

export interface BuildGlobalConfigDigestInput {
  model?: string;
  temperature?: number;
}

export interface DeriveDocExcerptInput {
  taskId: string;
  label: string;
  maxChars?: number;
}

export interface DocExcerptResult {
  excerpt: string;
  truncated: boolean;
  strategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback';
}

export interface NormalizeAgentTaskFilesInput {
  files: string[];
  projectRoot: string;
}

export interface AgentTaskBoundary {
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  parallelEligible: boolean;
  reason?: string;
}

export interface DeriveAgentTaskBoundaryInput {
  docExcerpt: string;
  label: string;
  projectRoot: string;
  packageScripts?: string[];
}

export interface DeriveValidationCommandsInput {
  allowedFiles: string[];
  taskLabel: string;
  packageScripts?: string[];
}

export interface AgentTaskConcurrencyDecision {
  mode: 'serial' | 'parallel';
  reason: string;
  groups: string[][];
}

export interface AgentTaskConcurrencyInput {
  taskId: string;
  label: string;
  allowedFiles: string[];
  forbiddenFiles?: string[];
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
}

export function computeInstructionHash(input: ComputeInstructionHashInput): string;
export function buildGlobalConfigDigest(input: BuildGlobalConfigDigestInput): string;
export function deriveDocExcerptFromText(
  text: string,
  input: DeriveDocExcerptInput,
): Promise<DocExcerptResult>;
export function deriveDocExcerptFromTextSync(
  text: string,
  input: DeriveDocExcerptInput,
): DocExcerptResult;
export function deriveDocExcerptFromLines(
  source: AsyncIterable<string> | Iterable<string>,
  input: DeriveDocExcerptInput,
): Promise<DocExcerptResult>;
export function deriveDocExcerptFromLinesSync(
  source: Iterable<string>,
  input: DeriveDocExcerptInput,
): DocExcerptResult;
export function normalizeAgentTaskFiles(input: NormalizeAgentTaskFilesInput): string[];
export function deriveAgentTaskBoundary(input: DeriveAgentTaskBoundaryInput): AgentTaskBoundary;
export function deriveValidationCommands(input: DeriveValidationCommandsInput): string[];
export function decideAgentTaskConcurrency(input: AgentTaskConcurrencyInput[]): AgentTaskConcurrencyDecision;
export function extractCandidateFiles(text: string): string[];
