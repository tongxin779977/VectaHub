import type { IntentName, TaskList, Workflow } from '../../types/index.js';
import type { MultiIntentResult } from '../types.js';

export interface NLContext {
  input: string;
  sessionId?: string;
  options?: {
    useLLM?: boolean;
    fallbackToKeyword?: boolean;
    confidenceThreshold?: number;
  };
}

export interface NLResult {
  success: boolean;
  intent?: IntentName;
  confidence: number;
  taskList?: TaskList;
  workflow?: Workflow;
  metadata: {
    path: 'skill-pipeline' | 'keyword-fallback' | 'keyword-match' | 'coordinator' | 'coordinator-multi' | 'category-router' | 'direct-query' | 'dialog';
    usedSkills?: string[];
    fallbackReason?: string;
    multiIntent?: MultiIntentResult;
    requiresLLM?: boolean;
  };
}

export interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}
