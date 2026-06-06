import type { NormalizedInput, ParsedGoal, GoalAction, GoalScope } from './goal-types.js';
import { normalizeInput } from './input-normalizer.js';
import {
  ACTION_MAP,
  SCOPE_MAP,
  FAILURE_TERMS,
  resolveDomainConflicts,
  CI_CONTEXT_KEYWORDS,
} from '../knowledge/goal-vocabulary.js';
import { detectNegation } from './llm-fallback.js';

function isCJK(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

const cjkActionKeys = Object.keys(ACTION_MAP).filter(k => isCJK(k)).sort((a, b) => b.length - a.length);
const nonCjkActionKeys = Object.keys(ACTION_MAP).filter(k => !isCJK(k)).sort((a, b) => b.length - a.length);
const cjkFailureTerms = FAILURE_TERMS.filter(t => isCJK(t)).sort((a, b) => b.length - a.length);
const nonCjkFailureTerms = FAILURE_TERMS.filter(t => !isCJK(t));
const cjkScopeKeys = Object.keys(SCOPE_MAP).filter(k => isCJK(k)).sort((a, b) => b.length - a.length);
const nonCjkScopeKeys = Object.keys(SCOPE_MAP).filter(k => !isCJK(k));

function detectAction(cleanText: string, terms: string[]): GoalAction {
  for (const key of cjkActionKeys) {
    if (cleanText.includes(key)) {
      return ACTION_MAP[key];
    }
  }
  for (const key of nonCjkActionKeys) {
    if (terms.includes(key)) {
      return ACTION_MAP[key];
    }
  }
  return 'unknown';
}

function detectDomains(terms: string[], entities: NormalizedInput['entities']): string[] {
  return resolveDomainConflicts(terms, entities);
}

function detectTarget(cleanText: string, terms: string[], entities: NormalizedInput['entities']): string | undefined {
  for (const term of cjkFailureTerms) {
    if (cleanText.includes(term)) {
      return 'failure';
    }
  }

  if (entities.githubActionRunIds?.length || entities.githubActionUrls?.length) {
    return 'failure';
  }

  if (nonCjkFailureTerms.some(t => terms.includes(t))) {
    return 'failure';
  }

  if (terms.includes('test')) {
    return 'test';
  }

  if (terms.includes('build')) {
    return 'build';
  }

  return undefined;
}

function detectScope(cleanText: string, terms: string[]): GoalScope {
  for (const key of cjkScopeKeys) {
    if (cleanText.includes(key)) {
      return SCOPE_MAP[key];
    }
  }
  for (const key of nonCjkScopeKeys) {
    if (terms.includes(key)) {
      return SCOPE_MAP[key];
    }
  }
  return 'unknown';
}

function detectSuccessCriteria(cleanText: string, target?: string): string[] {
  const criteria: string[] = [];
  const hasCiContext = CI_CONTEXT_KEYWORDS.some(kw => cleanText.includes(kw));

  if (hasCiContext) {
    criteria.push('ci-green');
  }

  if (target === 'failure') {
    criteria.push('no-errors');
    if (!criteria.includes('ci-green')) {
      criteria.push('ci-green');
    }
  }

  return criteria;
}

function calculateConfidence(
  action: GoalAction,
  domains: string[],
  target: string | undefined,
  scope: GoalScope,
  needsClarification: boolean,
): number {
  let score = 0;

  if (action !== 'unknown') {
    score += 0.35;
  }

  if (domains.length > 0) {
    score += 0.35;
  }

  if (target) {
    score += 0.15;
  }

  if (scope !== 'unknown') {
    score += 0.1;
  }

  if (domains.includes('github-actions')) {
    score += 0.05;
  }

  if (needsClarification) {
    score *= 0.5;
  }

  return Math.min(Math.max(score, 0), 1.0);
}

const MUTATING_ACTIONS: GoalAction[] = ['repair', 'run', 'create', 'delete', 'modify', 'deploy', 'git'];

export function parseGoal(input: string | NormalizedInput): ParsedGoal {
  const normalized = typeof input === 'string'
    ? normalizeInput(input)
    : input;

  const { cleanText, normalizedTerms, entities } = normalized;
  const action = detectAction(cleanText, normalizedTerms);
  const domains = detectDomains(normalizedTerms, entities);
  const target = detectTarget(cleanText, normalizedTerms, entities);
  const scope = detectScope(cleanText, normalizedTerms);
  const successCriteria = detectSuccessCriteria(cleanText, target);
  let needsClarification = action === 'unknown' || (!target && domains.length === 0);

  const negationPattern = detectNegation(cleanText);
  const negationDetected = negationPattern !== null && MUTATING_ACTIONS.includes(action);
  if (negationDetected) {
    needsClarification = true;
  }

  const confidence = calculateConfidence(action, domains, target, scope, needsClarification);

  return {
    action,
    domains,
    target,
    scope,
    successCriteria,
    constraints: [],
    evidence: entities,
    confidence,
    needsClarification,
    negationDetected: negationDetected || undefined,
  };
}
