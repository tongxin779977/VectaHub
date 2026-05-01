import type { IntentMatch, IntentName } from '../types/index.js';

export interface IntentPattern {
  intent: string;
  keywords: string[];
  weight: number;
  cli?: string[];
}

export interface IntentMatcher {
  match(input: string, sessionId?: string): IntentMatch;
  registerPattern(pattern: IntentPattern): void;
  getPatterns(): IntentPattern[];
}

export function createIntentMatcher(patterns: IntentPattern[]): IntentMatcher {
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
          const confidence = (matches / pattern.keywords.length) * pattern.weight;
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
        try {
          const { audit, AuditEventType } = require('../utils/audit.js');
          audit.intentMatch(bestMatch.intent, bestMatch.confidence, input, sessionId, {
            matchedKeywords: patterns
              .filter(p => p.intent === bestMatch.intent)
              .flatMap(p => p.keywords.filter(kw => lowerInput.includes(kw.toLowerCase()))),
          });
        } catch {}
      }

      return bestMatch;
    },

    registerPattern(pattern: IntentPattern): void {
      patterns.push(pattern);
    },

    getPatterns(): IntentPattern[] {
      return [...patterns];
    },
  };
}