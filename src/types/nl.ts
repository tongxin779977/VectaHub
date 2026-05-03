export type IntentName =
  | 'FILE_FIND'
  | 'GIT_WORKFLOW'
  | 'RUN_SCRIPT'
  | 'SYSTEM_INFO'
  | 'QUERY_INFO'
  | 'INSTALL_PACKAGE'
  | 'CREATE_FILE'
  | 'FETCH_HOT_NEWS'
  | 'SOCIAL_MEDIA_SEARCH'
  | 'DATA_SCRAPING'
  | 'CONTENT_SUMMARY'
  | 'FILE_ARCHIVE'
  | 'NETWORK_INFO'
  | 'SYSTEM_MONITOR'
  | 'FILE_PERMISSION'
  | 'FILE_DIFF'
  | 'UNKNOWN';

export interface IntentMatch {
  intent: IntentName;
  confidence: number;
  params: Record<string, unknown>;
}

export type EntityType = 'FILE_PATH' | 'CLI_TOOL' | 'PACKAGE_NAME' | 'FUNCTION_NAME' | 'BRANCH_NAME' | 'ENV' | 'OPTIONS' | 'HOST' | 'PORT' | 'OWNER' | 'MODE' | 'FILE1' | 'FILE2';

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

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';

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

export interface ParseResult {
  status: 'SUCCESS' | 'NEEDS_CLARIFICATION';
  taskList?: TaskList;
  candidates?: { intent: IntentName; description: string }[];
  confidenceLevel: ConfidenceLevel;
  originalInput: string;
}
