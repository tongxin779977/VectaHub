import type { IntentName } from '../../types/index.js';
import type { Workflow } from '../../types/index.js';

export interface TaskList {
  intent: IntentName | string;
  tasks: Task[];
}

export interface Task {
  id?: string;
  description?: string;
  commands?: Command[];
}

export interface Command {
  cli: string;
  args?: string[];
}

export interface NLResult {
  success: boolean;
  intent?: IntentName;
  confidence: number;
  taskList?: TaskList;
  workflowYAML?: string;
  workflow?: Workflow;
  metadata: {
    path: 'skill-pipeline' | 'keyword-fallback' | 'keyword-match' | 'coordinator' | 'coordinator-multi' | 'category-router' | 'direct-query' | 'dialog';
    usedSkills?: string[];
    fallbackReason?: string;
    multiIntent?: MultiIntentResult;
    requiresLLM?: boolean;
  };
}

export interface NLContext {
  input: string;
  sessionId?: string;
  options?: {
    useLLM?: boolean;
  };
}

export interface MultiIntentResult {
  primary: IntentResult;
  secondary: IntentResult[];
}

export interface IntentResult {
  intent: IntentName;
  confidence: number;
  params?: Record<string, unknown>;
}

export interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}