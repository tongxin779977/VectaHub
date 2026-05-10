import type { NormalizedInput } from './goal-types.js';

export function normalizeInput(rawInput: string): NormalizedInput {
  const cleanText = rawInput.toLowerCase().trim().replace(/\s+/g, ' ');
  const entities: NormalizedInput['entities'] = {};

  const runIds = extractRunIds(cleanText);
  if (runIds.length > 0) {
    entities.githubActionRunIds = runIds;
  }

  const urls = extractUrls(cleanText);
  if (urls.length > 0) {
    entities.githubActionUrls = urls;
  }

  const commitShas = extractCommitShas(cleanText);
  if (commitShas.length > 0) {
    entities.commitShas = commitShas;
  }

  const filePaths = extractFilePaths(cleanText);
  if (filePaths.length > 0) {
    entities.filePaths = filePaths;
  }

  const tokens = cleanText.split(/[\s,，.。!！?？、]+/).filter(Boolean);

  return {
    rawText: rawInput,
    cleanText,
    tokens,
    normalizedTerms: tokens,
    entities,
  };
}

export function extractRunIds(text: string): string[] {
  const runIdRegex = /\b\d{8,12}\b/g;
  const matches: string[] = [];
  let match;
  while ((match = runIdRegex.exec(text)) !== null) {
    const id = match[0];
    if (/^\d{8,12}$/.test(id)) {
      matches.push(id);
    }
  }
  return [...new Set(matches)];
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const matches: string[] = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return [...new Set(matches)];
}

export function extractCommitShas(text: string): string[] {
  const shaRegex = /\b[0-9a-f]{40}\b/gi;
  const matches: string[] = [];
  let match;
  while ((match = shaRegex.exec(text)) !== null) {
    matches.push(match[0].toLowerCase());
  }
  return [...new Set(matches)];
}

export function extractFilePaths(text: string): string[] {
  const filePathRegex = /(?:\/[\w.-]+)+\.\w+/g;
  const matches: string[] = [];
  let match;
  while ((match = filePathRegex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return [...new Set(matches)];
}
