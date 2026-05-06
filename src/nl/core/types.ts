import type { IntentName, TaskList } from '../../types/index.js';
import type { Workflow } from '../../types/index.js';

export interface NLResult {
  success: boolean;
  intent?: IntentName;
  confidence: number;
  taskList?: TaskList;
  workflowYAML?: string;
  workflow?: Workflow;
  metadata: {
    path: 'skill-pipeline' | 'keyword-fallback' | 'keyword-match' | 'keyword-only' | 'coordinator' | 'coordinator-multi' | 'category-router' | 'direct-query' | 'dialog' | 'skill-individual' | 'no-match';
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