import type { IntentName, TaskList, Workflow } from '../types/index.js';

export type KeywordTier = 'core' | 'important' | 'generic';

export interface WeightedKeyword {
  text: string;
  tier: KeywordTier;
  weight?: number;
}

export interface CompositePhrase {
  pattern: string;
  isRegex: boolean;
  weight: number;
  bonus: number;
}

export interface NegativeKeyword {
  text: string;
  strength: 'soft' | 'hard';
}

export interface IntentPattern {
  intent: string;
  keywords: WeightedKeyword[];
  phrases?: CompositePhrase[];
  negativeKeywords?: NegativeKeyword[];
  weight: number;
  cli?: string[];
  priority?: number;
  tags?: string[];
}

export interface IntentMatch {
  intent: string;
  confidence: number;
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';
  params: Record<string, unknown>;
  matchedKeywords: string[];
  matchedPhrases?: string[];
  triggeredNegatives?: string[];
  matchPath?: 'phrase' | 'keyword' | 'context';
  needsClarification?: boolean;
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

export interface IntentPrecedenceRule {
  when: string[];
  prefer: string;
  reason: string;
}

export const TIER_WEIGHTS: Record<KeywordTier, number> = {
  core: 1.0,
  important: 0.8,
  generic: 0.5,
};

export interface NLResult {
  success: boolean;
  intent?: IntentName;
  confidence: number;
  taskList?: TaskList;
  workflowYAML?: string;
  workflow?: Workflow;
  reply?: string;
  params?: Record<string, unknown>;
  metadata: {
    path: 'category-router' | 'rule-based' | 'no-match' | 'direct-query' | 'dialog' | 'reply-only' | 'acp-fallback';
    usedSkills?: string[];
    fallbackReason?: string;
    multiIntent?: MultiIntentResult;
    requiresLLM?: boolean;
    classifierKind?: 'query' | 'task' | 'dialog';
    /** ACP fallback 触发时记录的 agent tool calls(仅 path='acp-fallback' 时存在) */
    acpToolCalls?: unknown[];
    /** ACP fallback 触发时记录的变更文件列表(仅 path='acp-fallback' 时存在) */
    acpChangedFiles?: string[];
  };
}

export interface NLContext {
  input: string;
  sessionId?: string;
}

export interface CoreIntentMatch {
  intent: IntentName;
  confidence: number;
  params?: Record<string, unknown>;
}

export interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}
