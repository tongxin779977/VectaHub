import type { IntentPattern, MultiIntentResult, IntentMatch } from '../types.js';
import { createMatchingPipeline, type MatchingPipeline } from './matching-pipeline.js';
import { createIntentSplitter, type IntentSplitter } from './intent-splitter.js';
import { createPrecedenceResolver, type PrecedenceResolver } from './precedence-rules.js';

export interface Coordinator {
  match(input: string): MultiIntentResult;
}

export function createCoordinator(
  patterns: IntentPattern[],
  dependencies?: {
    pipeline?: MatchingPipeline;
    splitter?: IntentSplitter;
    resolver?: PrecedenceResolver;
  }
): Coordinator {
  const pipeline = dependencies?.pipeline ?? createMatchingPipeline();
  const splitter = dependencies?.splitter ?? createIntentSplitter();
  const resolver = dependencies?.resolver ?? createPrecedenceResolver();

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

      // Apply precedence rules to resolve conflicts between ambiguous intents
      const resolved = unique.length > 1 ? resolveWithPrecedence(unique, resolver, patterns) : unique;

      return {
        isMultiIntent: true,
        intents: resolved,
        rawInput: input,
        clauses: splitResult.clauses,
      };
    },
  };
}

function resolveWithPrecedence(
  intents: IntentMatch[],
  resolver: PrecedenceResolver,
  patterns: IntentPattern[]
): IntentMatch[] {
  if (intents.length <= 1) return intents;

  // If the top 2 intents have close confidence (< 0.08 diff), apply precedence rules
  const sorted = [...intents].sort((a, b) => b.confidence - a.confidence);
  const diff = sorted[0].confidence - sorted[1].confidence;

  if (diff < 0.08) {
    const resolved = resolver.resolve(sorted);
    if (resolved.intent !== sorted[0].intent) {
      // Swap: precedence rule picked a different intent as primary
      return [resolved, ...sorted.filter(i => i.intent !== resolved.intent)];
    }
  }

  return sorted;
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
