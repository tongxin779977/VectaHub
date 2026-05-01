export type IntentName =
  | 'IMAGE_COMPRESS'
  | 'FILE_FIND'
  | 'BACKUP'
  | 'CI_PIPELINE'
  | 'BATCH_RENAME'
  | 'GIT_WORKFLOW'
  | 'UNKNOWN';

export interface IntentMatch {
  intent: IntentName;
  confidence: number;
  params: Record<string, unknown>;
}

export type StepType = 'exec' | 'for_each' | 'if' | 'parallel';

export interface Step {
  id: string;
  type: StepType;
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  items?: string;
  outputVar?: string;
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
  | 'FAILED';

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

export interface CommandDetection {
  isDangerous: boolean;
  level: 'critical' | 'high' | 'medium' | 'low';
  reason?: string;
}

export type EntityType = 'FILE_PATH' | 'CLI_TOOL' | 'PACKAGE_NAME' | 'FUNCTION_NAME' | 'BRANCH_NAME' | 'ENV' | 'OPTIONS';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  startIndex: number;
  endIndex: number;
}

export interface EntityExtractor {
  extract(input: string): ExtractedEntity[];
}

export type TaskType =
  | 'CODE_TRANSFORM'
  | 'CODE_CREATE'
  | 'CODE_DELETE'
  | 'BUILD_VERIFY'
  | 'TEST_RUN'
  | 'PACKAGE_INSTALL'
  | 'GIT_OPERATION'
  | 'DOCKER_OPERATION'
  | 'QUERY_EXEC'
  | 'DEBUG_EXEC';

export interface Task {
  id: string;
  type: TaskType;
  description: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  commands: { cli: string; args: string[] }[];
  dependencies: string[];
  estimatedDuration?: number;
}

export interface TaskList {
  version: string;
  generatedAt: string;
  originalInput: string;
  intent: IntentName;
  confidence: number;
  entities: Record<EntityType, string[]>;
  tasks: Task[];
  warnings: string[];
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';

export interface ParseResult {
  status: 'SUCCESS' | 'NEEDS_CLARIFICATION';
  taskList?: TaskList;
  candidates?: { intent: IntentName; description: string }[];
  confidenceLevel: ConfidenceLevel;
  originalInput: string;
}