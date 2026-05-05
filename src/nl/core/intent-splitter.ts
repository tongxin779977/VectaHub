import type { ClauseSegment } from '../types.js';

export interface SplitResult {
  isMultiIntent: boolean;
  clauses: ClauseSegment[];
  rawInput: string;
}

export interface IntentSplitter {
  split(input: string): SplitResult;
}

const CONNECTORS: { pattern: RegExp; display: string }[] = [
  { pattern: /然后帮我|再帮我|并帮我/g, display: '然后帮我' },
  { pattern: /然后/g, display: '然后' },
  { pattern: /接着/g, display: '接着' },
  { pattern: /之后/g, display: '之后' },
  { pattern: /并且/g, display: '并且' },
  { pattern: /并/g, display: '并' },
  { pattern: /再/g, display: '再' },
  { pattern: /后/g, display: '后' },
  { pattern: /和/g, display: '和' },
  { pattern: /\band\b/gi, display: 'and' },
  { pattern: /\bthen\b/gi, display: 'then' },
  { pattern: /\balso\b/gi, display: 'also' },
];

export function createIntentSplitter(): IntentSplitter {
  return {
    split(input: string): SplitResult {
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

  for (const { pattern, display } of CONNECTORS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const match = regex.exec(input);
    if (match && match.index !== undefined) {
      if (!earliestMatch || match.index < earliestMatch.index) {
        earliestMatch = { index: match.index, length: match[0].length, connector: display };
      }
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
