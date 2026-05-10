import type { IntentName, TaskList } from '../../types/index.js';
import type { Workflow } from '../../types/index.js';

export interface NLResult {
  success: boolean;
  intent?: IntentName;
  confidence: number;
  taskList?: TaskList;
  workflowYAML?: string;
  workflow?: Workflow;
  params?: Record<string, unknown>; // Add params here
  metadata: {
    path: 'category-router' | 'llm-tool-calling' | 'no-match' | 'direct-query' | 'dialog';
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
  isMultiIntent: boolean;
  intents: IntentMatch[];
  rawInput: string;
  clauses?: ClauseSegment[];
}

export interface ClauseSegment {
  text: string;
  connector?: string;
  position: { start: number; end: number };
}

export interface IntentMatch {
  intent: IntentName;
  confidence: number;
  params?: Record<string, unknown>;
}

export interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}