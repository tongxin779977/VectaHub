export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface GitStatus {
  branch: string;
  modified: string[];
  staged: string[];
}

export interface ProjectContext {
  cwd: string;
  gitStatus?: GitStatus;
  packageJson?: Record<string, unknown>;
  configFiles?: string[];
}

export interface UserPreferences {
  executionMode: 'strict' | 'relaxed' | 'consensus';
  preferredTools: string[];
  verbose: boolean;
  autoConfirm: boolean;
}

export interface RecentAction {
  type: string;
  timestamp: Date;
  description: string;
}

export interface SessionContext {
  sessionId: string;
  history: Message[];
  userPreferences: UserPreferences;
  projectContext: ProjectContext;
  recentActions: RecentAction[];
}

export interface LLMOptions {
  useLLM: boolean;
  fallbackToKeyword: boolean;
  promptVersion: string;
  useFewShot: boolean;
  useContext: boolean;
  temperature: number;
  maxTokens: number;
  autoRefine: boolean;
  maxRetries: number;
  useCheapModelForSimpleTasks: boolean;
  maxCostPerDay: number;
}
