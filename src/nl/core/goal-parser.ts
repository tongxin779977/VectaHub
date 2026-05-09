import type { NormalizedInput, ParsedGoal, GoalAction, GoalScope } from './goal-types.js';
import { normalizeInput } from './input-normalizer.js';

const ACTION_MAP: Record<string, GoalAction> = {
  'repair': 'repair',
  '修复': 'repair',
  '处理': 'repair',
  '解决': 'repair',
  'run': 'run',
  '运行': 'run',
  '执行': 'run',
  '分析': 'analyze',
  'analyze': 'analyze',
  '创建': 'create',
  '新建': 'create',
  'delete': 'delete',
  '删除': 'delete',
  '搜索': 'search',
  '查找': 'search',
  'search': 'search',
  '解释': 'explain',
  'explain': 'explain',
  '查看': 'search',
  '提交': 'run',
  'git': 'run',
  'commit': 'run',
  'push': 'run',
  'pull': 'run',
};

const DOMAIN_CI_KEYWORDS = ['ci', 'github-actions', 'actions', 'action'];
const DOMAIN_GITHUB_KEYWORDS = ['github', 'github-actions'];
const DOMAIN_GIT_KEYWORDS = ['git', 'commit', 'push', 'pull', 'branch', 'merge'];
const DOMAIN_NPM_KEYWORDS = ['npm', 'build', 'lint'];
const DOMAIN_TEST_KEYWORDS = ['test', '测试'];
const DOMAIN_WORKFLOW_KEYWORDS = ['workflow', 'ci'];

const SCOPE_MAP: Record<string, GoalScope> = {
  '所有': 'all',
  '全部': 'all',
  'all': 'all',
  '这些': 'selected',
  '当前': 'current',
  '最新': 'latest',
  'latest': 'latest',
};

const FAILURE_TERMS = ['failure', '错误', '失败', 'failed', 'error', '挂了', '红了', '不通过', 'green', '绿'];

function detectAction(terms: string[]): GoalAction {
  for (const term of terms) {
    if (ACTION_MAP[term]) {
      return ACTION_MAP[term];
    }
  }
  return 'unknown';
}

function detectDomains(terms: string[]): string[] {
  const domains: string[] = [];
  const lowerTerms = terms.map(t => t.toLowerCase());

  const hasCiKeyword = lowerTerms.some(t => DOMAIN_CI_KEYWORDS.includes(t));
  const hasGithubKeyword = lowerTerms.some(t => DOMAIN_GITHUB_KEYWORDS.includes(t));
  const hasGitKeyword = lowerTerms.some(t => DOMAIN_GIT_KEYWORDS.includes(t));
  const hasNpmKeyword = lowerTerms.some(t => DOMAIN_NPM_KEYWORDS.includes(t));
  const hasTestKeyword = lowerTerms.some(t => DOMAIN_TEST_KEYWORDS.includes(t));
  const hasWorkflowKeyword = lowerTerms.some(t => DOMAIN_WORKFLOW_KEYWORDS.includes(t));

  const hasActionKeyword = lowerTerms.some(t => ['action'].includes(t));

  if (hasGithubKeyword && (hasCiKeyword || hasWorkflowKeyword)) {
    domains.push('github-actions');
  } else if (hasActionKeyword && lowerTerms.some(t => FAILURE_TERMS.includes(t))) {
    domains.push('github-actions');
  }

  if (hasCiKeyword && !domains.includes('github-actions')) {
    domains.push('ci');
  }

  if (hasGitKeyword && !hasGithubKeyword && !hasCiKeyword && !hasWorkflowKeyword) {
    domains.push('git');
  }

  if (hasTestKeyword && !domains.includes('github-actions')) {
    domains.push('test');
  }

  if (hasNpmKeyword && !domains.includes('github-actions') && !hasTestKeyword) {
    domains.push('npm');
  }

  if (domains.length === 0) {
    if (hasGitKeyword) {
      domains.push('git');
    }
  }

  return domains;
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
  const domains = detectDomains(normalized.normalizedTerms);
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
