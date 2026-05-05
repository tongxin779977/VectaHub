import type { IntentPattern, MultiIntentResult, IntentMatch } from '../types.js';
import { createMatchingPipeline, type MatchingPipeline } from './matching-pipeline.js';
import { createIntentSplitter, type IntentSplitter } from './intent-splitter.js';

export interface Coordinator {
  match(input: string): MultiIntentResult;
}

export function createCoordinator(
  patterns: IntentPattern[],
  dependencies?: {
    pipeline?: MatchingPipeline;
    splitter?: IntentSplitter;
  }
): Coordinator {
  const pipeline = dependencies?.pipeline ?? createMatchingPipeline();
  const splitter = dependencies?.splitter ?? createIntentSplitter();

  return {
    match(input: string): MultiIntentResult {
      const splitResult = splitter.split(input);

      if (!splitResult.isMultiIntent) {
        const matchResult = pipeline.match(input, patterns);
        return {
          isMultiIntent: false,
          intents: [matchResult],
          rawInput: input,
          clauses: splitResult.clauses,
        };
      }

      const intents: IntentMatch[] = [];
      for (const clause of splitResult.clauses) {
        const clauseResult = pipeline.match(clause.text, patterns);
        intents.push(clauseResult);
      }

      const unique = deduplicateIntents(intents);

      return {
        isMultiIntent: true,
        intents: unique,
        rawInput: input,
        clauses: splitResult.clauses,
      };
    },
  };
}

function deduplicateIntents(intents: IntentMatch[]): IntentMatch[] {
  const seen = new Set<string>();
  const result: IntentMatch[] = [];
  for (const intent of intents) {
    if (intent.intent === 'UNKNOWN') {
      result.push(intent);
      continue;
    }
    if (!seen.has(intent.intent)) {
      seen.add(intent.intent);
      result.push(intent);
    }
  }
  return result.length > 0 ? result : intents;
}
