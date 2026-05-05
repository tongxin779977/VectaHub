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
  matchPath?: 'phrase' | 'keyword' | 'llm' | 'context';
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
