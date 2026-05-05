import type {
  IntentPattern,
  IntentMatch,
  CompositePhrase,
  NegativeKeyword,
  WeightedKeyword,
} from '../types.js';
import { TIER_WEIGHTS } from '../types.js';

export interface MatchingPipeline {
  match(input: string, patterns: IntentPattern[]): IntentMatch;
}

export function createMatchingPipeline(): MatchingPipeline {
  return {
    match(input: string, patterns: IntentPattern[]): IntentMatch {
      const lowerInput = input.toLowerCase();
      const candidates: IntentMatch[] = [];

      for (const pattern of patterns) {
        const result = matchPattern(lowerInput, pattern);
        if (result) {
          candidates.push(result);
        }
      }

      if (candidates.length === 0) {
        return createUnknownResult(input);
      }

      candidates.sort((a, b) => b.confidence - a.confidence);
      return candidates[0];
    },
  };
}

function matchPattern(input: string, pattern: IntentPattern): IntentMatch | null {
  const matchedPhrases = matchPhrases(input, pattern.phrases ?? []);

  if (hasHardNegative(input, pattern.negativeKeywords ?? [])) {
    return null;
  }

  const keywordScore = calculateKeywordScore(input, pattern.keywords);
  const phraseScore = matchedPhrases.reduce((sum, p) => sum + p.bonus, 0);
  const negativePenalty = calculateSoftPenalty(input, pattern.negativeKeywords ?? []);
  const paramBoost = calculateParamBoost(input, pattern.cli ?? []);

  const baseConfidence = keywordScore * pattern.weight;
  const confidence = Math.max(0, baseConfidence + phraseScore - negativePenalty + paramBoost);

  if (confidence <= 0 && matchedPhrases.length === 0) {
    return null;
  }

  const matchPath: IntentMatch['matchPath'] = matchedPhrases.length > 0 ? 'phrase' : 'keyword';

  return {
    intent: pattern.intent,
    confidence,
    params: {},
    matchedKeywords: getMatchedKeywords(input, pattern.keywords),
    matchedPhrases: matchedPhrases.map(p => p.pattern),
    triggeredNegatives: getTriggeredNegatives(input, pattern.negativeKeywords ?? []),
    matchPath,
  };
}

function matchPhrases(input: string, phrases: CompositePhrase[]): CompositePhrase[] {
  const matched: CompositePhrase[] = [];
  for (const phrase of phrases) {
    if (phrase.isRegex) {
      try {
        const regex = new RegExp(phrase.pattern, 'i');
        if (regex.test(input)) {
          matched.push(phrase);
        }
      } catch {
        if (input.includes(phrase.pattern.toLowerCase())) {
          matched.push(phrase);
        }
      }
    } else {
      if (input.includes(phrase.pattern.toLowerCase())) {
        matched.push(phrase);
      }
    }
  }
  return matched;
}

function hasHardNegative(input: string, negatives: NegativeKeyword[]): boolean {
  return negatives
    .filter(n => n.strength === 'hard')
    .some(n => input.includes(n.text.toLowerCase()));
}

function calculateKeywordScore(input: string, keywords: WeightedKeyword[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (input.includes(kw.text.toLowerCase())) {
      const tierWeight = kw.weight ?? TIER_WEIGHTS[kw.tier];
      score += tierWeight;
    }
  }
  return score;
}

function calculateSoftPenalty(input: string, negatives: NegativeKeyword[]): number {
  let penalty = 0;
  for (const n of negatives) {
    if (n.strength === 'soft' && input.includes(n.text.toLowerCase())) {
      penalty += 0.3;
    }
  }
  return penalty;
}

function calculateParamBoost(input: string, cli: string[]): number {
  if (cli.length === 0) return 0;
  for (const tool of cli) {
    if (input.includes(tool.toLowerCase())) {
      return 0.15;
    }
  }
  return 0;
}

function getMatchedKeywords(input: string, keywords: WeightedKeyword[]): string[] {
  return keywords
    .filter(kw => input.includes(kw.text.toLowerCase()))
    .map(kw => kw.text);
}

function getTriggeredNegatives(input: string, negatives: NegativeKeyword[]): string[] {
  return negatives
    .filter(n => input.includes(n.text.toLowerCase()))
    .map(n => n.text);
}

function createUnknownResult(input: string): IntentMatch {
  return {
    intent: 'UNKNOWN',
    confidence: 0,
    params: {},
    matchedKeywords: [],
    matchedPhrases: [],
    triggeredNegatives: [],
    matchPath: 'keyword',
  };
}
