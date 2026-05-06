import type {
  IntentPattern,
  IntentMatch,
  CompositePhrase,
  NegativeKeyword,
  WeightedKeyword,
} from '../types.js';
import { TIER_WEIGHTS } from '../types.js';

// Confidence thresholds (defaults, can be overridden)
export const DEFAULT_CONFIDENCE_THRESHOLDS = {
  high: 0.7,
  medium: 0.5,
  low: 0.3,
  uncertain: 0.05,
} as const;

// Phrase score cap to prevent phrase overwhelming keywords
const PHRASE_SCORE_CAP = 2.0;

// Weight factors for combining signals
const KEYWORD_WEIGHT_FACTOR = 0.55;
const PHRASE_WEIGHT_FACTOR = 0.35;
const BOOST_WEIGHT_FACTOR = 0.1;

// Priority tie-breaker threshold
const PRIORITY_TIE_THRESHOLD = 0.08;

// Maximum possible keyword score for a template (used for normalization)
const MAX_KEYWORD_SCORE = 5.0;

// Soft penalty scale (each soft negative reduces score by this amount)
const SOFT_PENALTY_SCALE = 0.05;

export interface MatchingPipelineOptions {
  thresholds?: typeof DEFAULT_CONFIDENCE_THRESHOLDS;
  keywordWeight?: number;
  phraseWeight?: number;
  boostWeight?: number;
  softPenaltyScale?: number;
  tieThreshold?: number;
}

export interface MatchingPipeline {
  match(input: string, patterns: IntentPattern[]): IntentMatch;
}

export function createMatchingPipeline(options?: MatchingPipelineOptions): MatchingPipeline {
  const thresholds = options?.thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS;
  const kwWeight = options?.keywordWeight ?? KEYWORD_WEIGHT_FACTOR;
  const phWeight = options?.phraseWeight ?? PHRASE_WEIGHT_FACTOR;
  const btWeight = options?.boostWeight ?? BOOST_WEIGHT_FACTOR;
  const penaltyScale = options?.softPenaltyScale ?? SOFT_PENALTY_SCALE;
  const tieThreshold = options?.tieThreshold ?? PRIORITY_TIE_THRESHOLD;

  return {
    match(input: string, patterns: IntentPattern[]): IntentMatch {
      const lowerInput = input.toLowerCase();
      const candidates: IntentMatch[] = [];

      for (const pattern of patterns) {
        const result = matchPattern(lowerInput, pattern, {
          kwWeight, phWeight, btWeight, penaltyScale, thresholds,
        });
        if (result) {
          candidates.push(result);
        }
      }

      if (candidates.length === 0) {
        return createUnknownResult(input);
      }

      candidates.sort((a, b) => {
        // Primary: confidence
        const confDiff = b.confidence - a.confidence;
        if (Math.abs(confDiff) > tieThreshold) return confDiff;

        // Secondary: template weight (prefer higher weight templates)
        const weightDiff = getPatternWeight(b, patterns) - getPatternWeight(a, patterns);
        if (Math.abs(weightDiff) > 0.01) return weightDiff;

        // Tertiary: lower priority number wins (1 > 2 > 3)
        return (getPriority(a, patterns) ?? 99) - (getPriority(b, patterns) ?? 99);
      });

      return classifyConfidence(candidates[0], thresholds);
    },
  };
}

function getPatternWeight(match: IntentMatch, patterns: IntentPattern[]): number {
  const pattern = patterns.find(p => p.intent === match.intent);
  return pattern?.weight ?? 0;
}

function getPriority(match: IntentMatch, patterns: IntentPattern[]): number | undefined {
  const pattern = patterns.find(p => p.intent === match.intent);
  return pattern?.priority;
}

interface MatchOptions {
  kwWeight: number;
  phWeight: number;
  btWeight: number;
  penaltyScale: number;
  thresholds: typeof DEFAULT_CONFIDENCE_THRESHOLDS;
}

function matchPattern(input: string, pattern: IntentPattern, opts: MatchOptions): IntentMatch | null {
  if (hasHardNegative(input, pattern.negativeKeywords ?? [])) {
    return null;
  }

  const matchedKeywords = getMatchedKeywords(input, pattern.keywords);
  const keywordRawScore = calculateKeywordRawScore(matchedKeywords, pattern.keywords);
  const maxScore = calculateMaxScore(pattern.keywords);

  // Normalize keyword score to [0, 1]
  const keywordScore = maxScore > 0 ? Math.min(keywordRawScore / maxScore, 1.0) : 0;

  // Phrase score with cap, normalized to [0, 1]
  const phraseRawScore = calculatePhraseScore(input, pattern.phrases ?? []);
  const phraseScore = Math.min(phraseRawScore / PHRASE_SCORE_CAP, 1.0);

  // Negative penalty (soft only, already filtered hard)
  const negativePenalty = calculateSoftPenalty(input, pattern.negativeKeywords ?? []);

  // Parameter boost normalized to [0, 1]
  const paramBoost = calculateParamBoost(input, pattern.cli ?? []);

  // Normalized confidence = weighted combination
  // Range: [0, 1]
  const rawScore =
    opts.kwWeight * keywordScore * pattern.weight +
    opts.phWeight * phraseScore +
    opts.btWeight * paramBoost -
    negativePenalty * opts.penaltyScale;

  const confidence = clamp(rawScore, 0, 1);

  if (confidence < opts.thresholds.uncertain && phraseRawScore === 0) {
    return null;
  }

  const matchPath: IntentMatch['matchPath'] = phraseRawScore > 0 ? 'phrase' : 'keyword';

  return {
    intent: pattern.intent,
    confidence,
    confidenceLevel: undefined,
    params: {},
    matchedKeywords: matchedKeywords.map(kw => kw.text),
    matchedPhrases: getMatchedPhrases(input, pattern.phrases ?? []).map(p => p.pattern),
    triggeredNegatives: getTriggeredNegatives(input, pattern.negativeKeywords ?? []),
    matchPath,
    needsClarification: false,
  };
}

function classifyConfidence(
  match: IntentMatch,
  thresholds: typeof DEFAULT_CONFIDENCE_THRESHOLDS = DEFAULT_CONFIDENCE_THRESHOLDS
): IntentMatch {
  const { confidence } = match;

  let level: IntentMatch['confidenceLevel'];
  let needsClarification = false;

  if (confidence >= thresholds.high) {
    level = 'HIGH';
  } else if (confidence >= thresholds.medium) {
    level = 'MEDIUM';
  } else if (confidence >= thresholds.low) {
    level = 'LOW';
  } else if (confidence >= thresholds.uncertain) {
    level = 'UNCERTAIN';
    needsClarification = true;
  } else {
    level = 'UNCERTAIN';
    needsClarification = true;
  }

  return {
    ...match,
    confidenceLevel: level,
    needsClarification,
  };
}

const regexCache = new Map<string, RegExp>();

function matchPhrases(input: string, phrases: CompositePhrase[]): CompositePhrase[] {
  const matched: CompositePhrase[] = [];
  for (const phrase of phrases) {
    if (phrase.isRegex) {
      try {
        let regex = regexCache.get(phrase.pattern);
        if (!regex) {
          regex = new RegExp(phrase.pattern, 'i');
          regexCache.set(phrase.pattern, regex);
        }
        if (regex.test(input)) {
          matched.push(phrase);
        }
      } catch {
        if (input.includes(phrase.pattern.toLowerCase())) {
          matched.push(phrase);
        }
      }
    } else {
      // Use word-boundary aware matching for non-regex phrases
      if (containsToken(input, phrase.pattern.toLowerCase())) {
        matched.push(phrase);
      }
    }
  }
  return matched;
}

function hasHardNegative(input: string, negatives: NegativeKeyword[]): boolean {
  return negatives
    .filter(n => n.strength === 'hard')
    .some(n => containsToken(input, n.text.toLowerCase()));
}

function calculateKeywordRawScore(matched: WeightedKeyword[], keywords: WeightedKeyword[]): number {
  let score = 0;
  for (const kw of matched) {
    const tierWeight = kw.weight ?? TIER_WEIGHTS[kw.tier];
    score += tierWeight;
  }
  return score;
}

function calculateMaxScore(keywords: WeightedKeyword[]): number {
  let max = 0;
  for (const kw of keywords) {
    max += kw.weight ?? TIER_WEIGHTS[kw.tier];
  }
  return Math.min(max, MAX_KEYWORD_SCORE);
}

function calculatePhraseScore(input: string, phrases: CompositePhrase[]): number {
  const matched = matchPhrases(input, phrases);
  return matched.reduce((sum, p) => sum + p.bonus, 0);
}

function calculateSoftPenalty(input: string, negatives: NegativeKeyword[]): number {
  let penalty = 0;
  for (const n of negatives) {
    if (n.strength === 'soft' && containsToken(input, n.text.toLowerCase())) {
      penalty += 1;
    }
  }
  return penalty;
}

function calculateParamBoost(input: string, cli: string[]): number {
  if (cli.length === 0) return 0;
  let matched = 0;
  for (const tool of cli) {
    if (containsToken(input, tool.toLowerCase())) {
      matched++;
    }
  }
  return Math.min(matched / cli.length, 1.0);
}

function getMatchedKeywords(input: string, keywords: WeightedKeyword[]): WeightedKeyword[] {
  return keywords.filter(kw => containsToken(input, kw.text.toLowerCase()));
}

function getMatchedPhrases(input: string, phrases: CompositePhrase[]): CompositePhrase[] {
  return matchPhrases(input, phrases);
}

function getTriggeredNegatives(input: string, negatives: NegativeKeyword[]): string[] {
  return negatives
    .filter(n => containsToken(input, n.text.toLowerCase()))
    .map(n => n.text);
}

/**
 * Word-boundary aware substring matching.
 * Prevents "提交" matching "预提交", "git" matching "digit".
 */
function containsToken(input: string, token: string): boolean {
  // For Chinese text (no spaces), use contains
  // For English/Latin, use word boundary
  const isChineseOrCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(token);

  if (isChineseOrCJK) {
    return input.includes(token);
  }

  // Word boundary for ASCII tokens
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(input);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createUnknownResult(input: string): IntentMatch {
  return {
    intent: 'UNKNOWN',
    confidence: 0,
    confidenceLevel: 'UNCERTAIN',
    params: {},
    matchedKeywords: [],
    matchedPhrases: [],
    triggeredNegatives: [],
    matchPath: 'keyword',
    needsClarification: true,
  };
}
