import type { IntentMatch, IntentName } from '../types/index.js';
import type { MultiIntentResult } from './types.js';
import { audit, AuditEventType } from '../utils/audit.js';

/**
 * @deprecated Use IntentPattern (src/nl/types.ts) with WeightedKeywords
 * and CompositePhrases for richer matching. Will be removed in v2.0.
 */
export interface LegacyIntentPattern {
  intent: string;
  keywords: string[];
  weight: number;
  cli?: string[];
}

export interface LegacyIntentMatcher {
  match(input: string, sessionId?: string): IntentMatch;
  matchMultiIntent(input: string, sessionId?: string): MultiIntentResult;
  registerPattern(pattern: LegacyIntentPattern): void;
  getPatterns(): LegacyIntentPattern[];
}

export function createIntentMatcher(patterns: LegacyIntentPattern[], coordinator?: {
  match(input: string): MultiIntentResult;
}): LegacyIntentMatcher {
  return {
    match(input: string, sessionId?: string): IntentMatch {
      const lowerInput = input.toLowerCase();
      let bestMatch: IntentMatch = {
        intent: 'UNKNOWN',
        confidence: 0,
        params: {},
      };

      for (const pattern of patterns) {
        const matches = pattern.keywords.filter((kw) =>
          lowerInput.includes(kw.toLowerCase())
        ).length;

        if (matches > 0) {
          const confidence = matches * pattern.weight;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              intent: pattern.intent as IntentName,
              confidence,
              params: {},
            };
          }
        }
      }

      if (sessionId) {
        audit.intentMatch(bestMatch.intent, bestMatch.confidence, { input }, sessionId, {
          matchedKeywords: patterns
            .filter(p => p.intent === bestMatch.intent)
            .flatMap(p => p.keywords.filter(kw => lowerInput.includes(kw.toLowerCase()))),
        });
      }

      return bestMatch;
    },

    matchMultiIntent(input: string, sessionId?: string): MultiIntentResult {
      if (coordinator) {
        return coordinator.match(input);
      }

      const single = this.match(input, sessionId);
      return {
        isMultiIntent: false,
        intents: [{
          intent: single.intent,
          confidence: single.confidence,
          params: single.params,
          matchedKeywords: [],
        }],
        rawInput: input,
      };
    },

    registerPattern(pattern: LegacyIntentPattern): void {
      patterns.push(pattern);
    },

    getPatterns(): LegacyIntentPattern[] {
      return [...patterns];
    },
  };
}
