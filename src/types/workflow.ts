export type StepType = 'exec' | 'for_each' | 'if' | 'parallel' | 'opencli' | 'delegate';

export interface AIDelegateOptions {
  maxTurns?: number;
  allowedTools?: string[];
  timeout?: number;
  outputFormat?: 'text' | 'json' | 'stream-json';
}

export interface Step {
  id: string;
  type: StepType;
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  dependsOn?: string[];
  items?: string;
  outputVar?: string;
  site?: string;
  command?: string;
  delegateTo?: 'gemini' | 'claude' | 'codex' | 'aider' | 'custom';
  delegatePrompt?: string;
  delegateContext?: Record<string, unknown>;
  delegateOptions?: AIDelegateOptions;
}

export type WorkflowMode = 'strict' | 'relaxed' | 'consensus';

export interface Workflow {
  id: string;
  name: string;
  mode: WorkflowMode;
  steps: Step[];
  createdAt: Date;
}

export type ExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export interface ExecutionRecord {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  mode: WorkflowMode;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  steps: StepRecord[];
  warnings: string[];
  logs: string[];
}

export interface StepRecord {
  stepId: string;
  status: ExecutionStatus;
  startAt?: Date;
  endAt?: Date;
  output?: unknown[];
  error?: string;
  iterations?: number;
}

export type SandboxMode = 'STRICT' | 'RELAXED' | 'CONSENSUS';

export type DangerCategory = 'SYSTEM' | 'FS' | 'NETWORK' | 'RESOURCE';

export interface CommandDetection {
  isDangerous: boolean;
  level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  reason?: string;
  matchedPattern?: string;
  category?: DangerCategory;
}
