import { normalizeInput } from './input-normalizer.js';
import type { NormalizedInput } from './goal-types.js';

export interface SplitClause {
  text: string;
  connector?: string;
  position: { start: number; end: number };
}

export interface SplitResult {
  isMultiIntent: boolean;
  intents: Array<{
    intent: string;
    confidence: number;
    params?: Record<string, unknown>;
  }>;
  clauses?: SplitClause[];
  rawInput: string;
}

export interface IntentSplitter {
  split(input: string): SplitResult | Promise<SplitResult>;
}

const CONNECTORS = [
  { pattern: /\s*然后帮我\s*/g, connector: '然后帮我' },
  { pattern: /\s*并且\s*/g, connector: '并且' },
  { pattern: /\s*然后\s*/g, connector: '然后' },
  { pattern: /\s*并\s*(?=[\u4e00-\u9fa5])/g, connector: '并' },
  { pattern: /\s*再\s*(?=[\u4e00-\u9fa5])/g, connector: '再' },
  { pattern: /\s*\band\b\s*/gi, connector: 'and' },
];

function splitByConnectors(input: string): SplitClause[] {
  let bestSplit: SplitClause[] | null = null;

  for (const { pattern, connector } of CONNECTORS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const parts: SplitClause[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
      const before = input.slice(lastIndex, match.index).trim();
      if (before) {
        parts.push({
          text: before,
          connector: parts.length > 0 ? undefined : connector,
          position: { start: lastIndex, end: match.index },
        });
      }
      lastIndex = match.index + match[0].length;
    }

    const remaining = input.slice(lastIndex).trim();
    if (remaining) {
      parts.push({
        text: remaining,
        connector: parts.length > 0 ? connector : undefined,
        position: { start: lastIndex, end: input.length },
      });
    }

    if (parts.length >= 2) {
      if (!bestSplit || parts.length > bestSplit.length) {
        bestSplit = parts;
      }
    }
  }

  if (bestSplit) {
    return bestSplit;
  }

  return [{
    text: input.trim(),
    position: { start: 0, end: input.length },
  }];
}

export function validateInput(input: string): { valid: boolean; reason?: string } {
  if (typeof input !== 'string' || !input.trim()) {
    return { valid: false, reason: 'Input is empty' };
  }
  if (input.length > 5000) {
    return { valid: false, reason: 'Input exceeds maximum length of 5000 characters' };
  }
  return { valid: true };
}

export function createIntentSplitter(): IntentSplitter {
  return {
    split(input: string): SplitResult {
      const validation = validateInput(input);
      if (!validation.valid) {
        return {
          isMultiIntent: false,
          intents: [],
          clauses: [{ text: input.trim(), position: { start: 0, end: input.length } }],
          rawInput: input,
        };
      }

      const clauses = splitByConnectors(input);
      const isMultiIntent = clauses.length > 1;

      const intents = clauses.map(clause => {
        const normalized: NormalizedInput = normalizeInput(clause.text);
        return {
          intent: normalized.cleanText,
          confidence: 1.0,
          params: normalized.entities,
        };
      });

      return {
        isMultiIntent,
        intents,
        clauses,
        rawInput: input,
      };
    },
  };
}
