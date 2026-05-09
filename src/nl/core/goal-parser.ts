import type { NormalizedInput, ParsedGoal, GoalAction, GoalScope } from './goal-types.js';
import { normalizeInput } from './input-normalizer.js';
import {
  ACTION_MAP,
  SCOPE_MAP,
  FAILURE_TERMS,
  resolveDomainConflicts,
} from '../knowledge/goal-vocabulary.js';

function detectAction(terms: string[]): GoalAction {
  for (const term of terms) {
    if (ACTION_MAP[term]) {
      return ACTION_MAP[term];
    }
  }
  return 'unknown';
}

function detectDomains(terms: string[], entities: NormalizedInput['entities']): string[] {
  return resolveDomainConflicts(terms, entities);
}

function detectTarget(terms: string[], entities: NormalizedInput['entities']): string | undefined {
  const lowerTerms = terms.map(t => t.toLowerCase());

  if (lowerTerms.some(t => FAILURE_TERMS.includes(t))) {
    return 'failure';
  }

  if (entities.githubActionRunIds?.length || entities.githubActionUrls?.length) {
    return 'failure';
  }

  if (lowerTerms.includes('test')) {
    return 'test';
  }

  if (lowerTerms.includes('build')) {
    return 'build';
  }

  return undefined;
}

function detectScope(terms: string[]): GoalScope {
  for (const term of terms) {
    if (SCOPE_MAP[term]) {
      return SCOPE_MAP[term];
    }
  }
  return 'unknown';
}

function detectSuccessCriteria(terms: string[], target?: string): string[] {
  const criteria: string[] = [];
  const lowerTerms = terms.map(t => t.toLowerCase());

  if (target === 'failure' && lowerTerms.includes('ci')) {
    criteria.push('ci-green');
  }

  if (target === 'failure' && lowerTerms.some(t => FAILURE_TERMS.includes(t))) {
    criteria.push('no-errors');
  }

  return criteria;
}

function calculateConfidence(action: GoalAction, domains: string[], target: string | undefined): number {
  let score = 0;

  if (action !== 'unknown') {
    score += 0.35;
  }

  if (domains.length > 0) {
    score += 0.35;
  }

  if (target) {
    score += 0.2;
  }

  if (domains.includes('github-actions')) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

export function parseGoal(input: string | NormalizedInput): ParsedGoal {
  const normalized = typeof input === 'string'
    ? normalizeInput(input)
    : input;

  const action = detectAction(normalized.normalizedTerms);
  const domains = detectDomains(normalized.normalizedTerms, normalized.entities);
  const target = detectTarget(normalized.normalizedTerms, normalized.entities);
  const scope = detectScope(normalized.normalizedTerms);
  const successCriteria = detectSuccessCriteria(normalized.normalizedTerms, target);
  const confidence = calculateConfidence(action, domains, target);

  const needsClarification = action === 'unknown' || (!target && domains.length === 0);

  return {
    action,
    domains,
    target,
    scope,
    successCriteria,
    constraints: [],
    evidence: normalized.entities,
    confidence,
    needsClarification,
  };
}
