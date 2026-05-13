export interface DocTaskContractInput {
  id: string;
  label: string;
}

export interface AgentTaskContractSummary {
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  docExcerptTruncated: boolean;
  excerptStrategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback' | 'none';
}

export interface AgentTaskRunContractSummary {
  boundaryConfidence: AgentTaskContractSummary['boundaryConfidence'];
  allowedFileCount: number;
  forbiddenFileCount: number;
  validationCommandCount: number;
  executionMode: AgentTaskContractSummary['executionMode'];
}

export interface DocTaskConcurrencyDecision {
  mode: 'serial' | 'parallel';
  reason: string;
  effectiveMaxConcurrent: number;
}
