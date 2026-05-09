import type { NormalizedInput } from './goal-types.js';
import { PHRASE_MAP, SYNONYM_MAP, CI_CONTEXT_KEYWORDS } from '../knowledge/goal-vocabulary.js';

const GITHUB_URL_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/(\d+)/g;
const COMMIT_SHA_RE = /\b[0-9a-f]{40}\b/g;
const FILE_PATH_RE = /\b(?:src|lib|test|tests|packages|templates|config)\/[\w./-]+\.\w+\b/g;

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const CJK_PUNCT_RE = /[，。！？、；：""''（）【】《》]/;

function tokenize(text: string): string[] {
  let separated = '';
  for (const ch of text) {
    if (CJK_PUNCT_RE.test(ch)) {
      separated += ' ';
    } else if (CJK_RE.test(ch)) {
      separated += ` ${ch} `;
    } else if (ch === ',' || ch === '!' || ch === '.') {
      separated += ' ';
    } else {
      separated += ch;
    }
  }
  return separated
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

function hasCiContext(text: string): boolean {
  const lower = text.toLowerCase();
  return CI_CONTEXT_KEYWORDS.some(kw => lower.includes(kw));
}

function extractRunIds(text: string): string[] {
  const ids: string[] = [];
  const urlMatches = text.matchAll(GITHUB_URL_RE);
  for (const m of urlMatches) {
    ids.push(m[1]);
  }

  if (hasCiContext(text)) {
    const bareIds = text.match(/\b\d{7,}\b/g);
    if (bareIds) {
      for (const id of bareIds) {
        if (!ids.includes(id)) {
          ids.push(id);
        }
      }
    }
  }

  return ids.length > 0 ? ids : [];
}

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const matches = text.matchAll(GITHUB_URL_RE);
  for (const m of matches) {
    urls.push(m[0]);
  }
  return urls.length > 0 ? urls : [];
}

function extractCommitShas(text: string): string[] {
  const shas = text.match(COMMIT_SHA_RE);
  return shas ? [...new Set(shas)] : [];
}

function extractFilePaths(text: string): string[] {
  const paths = text.match(FILE_PATH_RE);
  return paths ? [...new Set(paths)] : [];
}

export function normalizeInput(input: string): NormalizedInput {
  const rawText = input;
  const cleanText = input.trim().replace(/\s+/g, ' ');

  let processedText = cleanText;
  const phraseMatches: string[] = [];
  for (const [phrase, normalized] of Object.entries(PHRASE_MAP)) {
    if (processedText.toLowerCase().includes(phrase)) {
      if (!phraseMatches.includes(normalized)) {
        phraseMatches.push(normalized);
      }
      processedText = processedText.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
  }

  const tokens = tokenize(processedText);
  const normalizedTerms: string[] = [...phraseMatches];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (SYNONYM_MAP[lower]) {
      const mapped = SYNONYM_MAP[lower];
      if (!normalizedTerms.includes(mapped)) {
        normalizedTerms.push(mapped);
      }
    } else if (lower.length > 0 && !normalizedTerms.includes(lower)) {
      normalizedTerms.push(lower);
    }
  }

  if (normalizedTerms.includes('github') && normalizedTerms.includes('ci')) {
    if (!normalizedTerms.includes('github-actions')) {
      normalizedTerms.push('github-actions');
    }
  }

  return {
    rawText,
    cleanText,
    tokens,
    normalizedTerms,
    entities: {
      ...(extractUrls(input).length > 0 ? { githubActionUrls: extractUrls(input) } : {}),
      ...(extractRunIds(input).length > 0 ? { githubActionRunIds: extractRunIds(input) } : {}),
      ...(extractFilePaths(input).length > 0 ? { filePaths: extractFilePaths(input) } : {}),
      ...(extractCommitShas(input).length > 0 ? { commitShas: extractCommitShas(input) } : {}),
    },
  };
}
