
export type AIModuleType = 'ai-enhancement' | 'cli-plugin';

export interface AIModule<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  version: string;
  type: AIModuleType;
  canHandle(context: AIModuleContext): Promise<boolean>;
  initialize?(): Promise<void>;
  execute(input: TInput, context: AIModuleContext): Promise<AIModuleResult<TOutput>>;
  shutdown?(): Promise<void>;
}

export interface AIModuleContext {
  sessionId?: string;
  userInput?: string;
  delegateTo?: string;
  metadata?: Record<string, unknown>;
}

export interface AIModuleResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  confidence?: number;
}

export interface AIModuleMetadata {
  enabled: boolean;
  dependencies?: string[];
  config?: Record<string, unknown>;
}

export interface AIModuleRegistry {
  register(module: AIModule, metadata?: AIModuleMetadata): void;
  unregister(moduleId: string): boolean;
  get(moduleId: string): AIModule | undefined;
  getMetadata(moduleId: string): AIModuleMetadata | undefined;
  setMetadata(moduleId: string, metadata: Partial<AIModuleMetadata>): void;
  list(): AIModule[];
  listByType(type: AIModuleType): AIModule[];
  findApplicable(context: AIModuleContext): Promise<AIModule[]>;
  isEnabled(moduleId: string): boolean;
  size(): number;
  clear(): void;
}

export interface SemanticMatchResult {
  intentName: string;
  similarityScore: number;
  keywordScore: number;
  combinedScore: number;
}

export interface AgentDelegateResult {
  status: 'completed' | 'failed' | 'exceeded_max_turns';
  output: string;
  toolCalls: AgentToolCallResult[];
  duration: number;
}

export interface AgentToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
}

export interface DiagnosisResult {
  rootCause: string;
  category: string;
  fixSuggestions: FixSuggestion[];
  confidence: number;
  needsHumanReview: boolean;
}

export interface FixSuggestion {
  description: string;
  command?: string;
  risk: 'low' | 'medium' | 'high';
}

export interface CliPluginResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
