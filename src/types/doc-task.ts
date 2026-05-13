export type DocTaskRunStatus =
  | 'parsed'
  | 'ready'
  | 'preflight'
  | 'running'
  | 'changed'
  | 'verifying'
  | 'success'
  | 'failed_config'
  | 'failed_agent'
  | 'failed_json_protocol'
  | 'failed_timeout'
  | 'failed_test'
  | 'failed_conflict'
  | 'cancelled'
  | 'needs_confirmation';

export type DocTaskDisplayStatus =
  | 'pending'
  | 'ready'
  | 'preflight'
  | 'running'
  | 'changed'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'needs-confirmation';

export type DocTaskFailureKind =
  | 'config'
  | 'agent'
  | 'json_protocol'
  | 'timeout'
  | 'test'
  | 'conflict'
  | 'cancelled'
  | 'unknown';

export interface DocTask {
  id: string;
  label: string;
  status?: DocTaskDisplayStatus;
  lastRunId?: string;
  lastTraceId?: string;
  lastFailureKind?: DocTaskFailureKind;
}

export interface AgentTaskContract {
  taskId: string;
  label: string;
  docPath?: string;
  docExcerpt?: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  timeoutMs: number;
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  notes?: string[];
}

export interface AgentTaskBoundary {
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  parallelEligible: boolean;
  reason?: string;
}

export interface AgentTaskConcurrencyDecision {
  mode: 'serial' | 'parallel';
  reason: string;
  groups: string[][];
}
