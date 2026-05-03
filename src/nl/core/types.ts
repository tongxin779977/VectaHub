import type { IntentName, TaskList, Workflow } from '../../types/index.js';

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
    path: 'skill-pipeline' | 'keyword-fallback';
    usedSkills: string[];
    fallbackReason?: string;
  };
}

export interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}
