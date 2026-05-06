import type { ClauseSegment } from '../types.js';
import {
  CHINESE_ACTION_VERBS,
  UNCONDITIONAL_CONNECTORS,
  containsActionVerb,
  isShortNounPhrase,
} from './verb-list.js';

const MAX_INPUT_LENGTH = 5000;

export interface SplitResult {
  isMultiIntent: boolean;
  clauses: ClauseSegment[];
  rawInput: string;
}

export interface IntentSplitter {
  split(input: string): SplitResult;
}

interface ContextConnector {
  pattern: RegExp;
  display: string;
  contextCheck: (before: string, after: string) => boolean;
}

const DECORATIVE_VERBS = [
  '统计', '计算', '显示', '展示', '说明', '记录', '分析',
  '切换',
];

function isDecorativePhrase(text: string): boolean {
  for (const verb of DECORATIVE_VERBS) {
    if (text.includes(verb)) return true;
  }
  return false;
}

const COMPOUND_WITH_BING = [
  '并排', '并发', '并且', '合并', '兼并',
];

function isCompoundWithBing(input: string, bingIndex: number): boolean {
  for (const compound of COMPOUND_WITH_BING) {
    const bingPos = compound.indexOf('并');
    const before = compound.slice(0, bingPos);
    const after = compound.slice(bingPos + 1);

    const hasBefore = before.length === 0 || input.slice(0, bingIndex).endsWith(before);
    const hasAfter = input.slice(bingIndex + 1).startsWith(after);

    if (hasBefore && hasAfter) return true;
  }
  return false;
}

const SHORT_CONNECTORS: ContextConnector[] = [
  {
    pattern: /并{1}/g,
    display: '并',
    contextCheck: (before, after) => {
      if (isCompoundWithBing(before + '并' + after, before.length)) return false;
      if (isDecorativePhrase(after)) return false;
      return containsActionVerb(before) || containsActionVerb(after);
    },
  },
  {
    pattern: /和{1}/g,
    display: '和',
    contextCheck: (before, after) => {
      const beforeTrimmed = before.trim();
      const afterTrimmed = after.trim();

      const isBeforeParam = beforeTrimmed.length <= 18 && !containsActionVerb(beforeTrimmed);
      const isAfterParam = afterTrimmed.length <= 18 && !containsActionVerb(afterTrimmed);

      if (isBeforeParam && isAfterParam) return false;
      if (afterTrimmed.length <= 15 && !containsActionVerb(afterTrimmed)) return false;

      return containsActionVerb(before) || containsActionVerb(after);
    },
  },
  {
    pattern: /再{1}/g,
    display: '再',
    contextCheck: (before, after) => {
      return containsActionVerb(before) || containsActionVerb(after);
    },
  },
  {
    pattern: /后{1}/g,
    display: '后',
    contextCheck: (before, after) => {
      return containsActionVerb(after);
    },
  },
  {
    pattern: /\band\b/gi,
    display: 'and',
    contextCheck: (before, after) => {
      const hasEnglishVerb = /\b(find|search|create|build|run|install|delete|modify|check|start|stop|open|close|add|remove|get|set|update|commit|push|pull)\b/i.test(before + ' ' + after);
      if (isShortNounPhrase(before, 15) && isShortNounPhrase(after, 15) && !hasEnglishVerb) return false;
      return true;
    },
  },
  {
    pattern: /\bthen\b/gi,
    display: 'then',
    contextCheck: () => true,
  },
  {
    pattern: /\balso\b/gi,
    display: 'also',
    contextCheck: () => true,
  },
];

function validateInput(input: string): { valid: boolean; message?: string } {
  if (!input) {
    return { valid: false, message: 'Empty input' };
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return { valid: false, message: `Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters` };
  }

  const suspiciousPatterns = [
    /(.)\1{10,}/,
    /([a-zA-Z])\1{20,}/,
    /[\u4e00-\u9fa5]{50,}/,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(input)) {
      return { valid: false, message: 'Input contains suspicious repeating patterns' };
    }
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
          clauses: [{ text: input, position: { start: 0, end: input.length } }],
          rawInput: input,
        };
      }

      const trimmed = input.trim();
      if (!trimmed) {
        return {
          isMultiIntent: false,
          clauses: [{ text: input, position: { start: 0, end: input.length } }],
          rawInput: input,
        };
      }

      const segments = splitByConnectors(trimmed);
      return {
        isMultiIntent: segments.length > 1,
        clauses: segments,
        rawInput: input,
      };
    },
  };
}

function splitByConnectors(input: string): ClauseSegment[] {
  let earliestMatch: { index: number; length: number; connector: string } | null = null;

  for (const { pattern, display } of UNCONDITIONAL_CONNECTORS) {
    try {
      const regex = new RegExp(pattern.source, pattern.flags);
      const match = regex.exec(input);
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = { index: match.index, length: match[0].length, connector: display };
        }
      }
    } catch {
      continue;
    }
  }

  for (const { pattern, display, contextCheck } of SHORT_CONNECTORS) {
    try {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      let iterations = 0;
      const maxIterations = 100;

      while ((match = regex.exec(input)) !== null && iterations < maxIterations) {
        iterations++;
        if (match.index !== undefined) {
          const before = input.slice(0, match.index);
          const after = input.slice(match.index + match[0].length);
          if (contextCheck(before, after)) {
            if (!earliestMatch || match.index < earliestMatch.index) {
              earliestMatch = { index: match.index, length: match[0].length, connector: display };
            }
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (!earliestMatch) {
    return [{ text: input, position: { start: 0, end: input.length } }];
  }

  const left = input.slice(0, earliestMatch.index).trim();
  const right = input.slice(earliestMatch.index + earliestMatch.length).trim();

  const segments: ClauseSegment[] = [];

  if (left) {
    segments.push({
      text: left,
      position: { start: 0, end: earliestMatch.index },
    });
  }

  const rightStart = earliestMatch.index + earliestMatch.length;
  if (right) {
    const innerSegments = splitByConnectors(right);
    for (let i = 0; i < innerSegments.length; i++) {
      const seg = innerSegments[i];
      segments.push({
        text: seg.text,
        connector: i === 0 ? earliestMatch.connector : seg.connector,
        position: { start: rightStart + seg.position.start, end: rightStart + seg.position.end },
      });
    }
  } else if (left) {
    segments[segments.length - 1] = {
      ...segments[segments.length - 1],
    };
  }

  return segments.length > 0 ? segments : [{ text: input, position: { start: 0, end: input.length } }];
}