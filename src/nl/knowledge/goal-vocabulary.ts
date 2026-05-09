import type { GoalAction, GoalScope } from '../core/goal-types.js';

/**
 * 词组映射：用于 input-normalizer 预处理，将多字词组归一化为核心词
 */
export const PHRASE_MAP: Record<string, string> = {
  'git 上': 'github',
  'git上': 'github',
  '测试用例': 'test',
  '修复': 'repair',
  '处理': 'repair',
  '解决': 'repair',
  '搞定': 'repair',
  '弄好': 'repair',
  '失败': 'failure',
  '错误': 'failure',
  '不通过': 'failure',
  '全部': 'all',
  '所有': 'all',
  '提交': 'git',
  '运行': 'run',
  '执行': 'run',
  '分析': 'analyze',
  '解释': 'explain',
  '查找': 'search',
  '搜索': 'search',
  '创建': 'create',
  '新建': 'create',
  '删除': 'delete',
  '构建': 'build',
  '测试': 'test',
  '最新': 'latest',
  '修': 'repair',
  '复': 'repair',
  '绿': 'green',
};

/**
 * 同义词映射：用于将 token 映射到标准化术语
 */
export const SYNONYM_MAP: Record<string, string> = {
  '修复': 'repair',
  '处理': 'repair',
  '解决': 'repair',
  '搞定': 'repair',
  '弄好': 'repair',
  'fix': 'repair',
  'resolve': 'repair',
  '修': 'repair',
  '修好': 'repair',
  '错误': 'failure',
  '失败': 'failure',
  '挂了': 'failure',
  '红了': 'failure',
  '不通过': 'failure',
  'failed': 'failure',
  'error': 'failure',
  'actions': 'ci',
  'workflow': 'ci',
  'checks': 'ci',
  'pipeline': 'ci',
  'ci': 'ci',
  'github': 'github',
  'gh': 'github',
  '所有': 'all',
  '全部': 'all',
  'all': 'all',
  '提交': 'git',
  'commit': 'git',
  'push': 'git',
  'pull': 'git',
  'branch': 'git',
  'merge': 'git',
  '测试': 'test',
  'test': 'test',
  '构建': 'build',
  'build': 'build',
  'lint': 'lint',
  '运行': 'run',
  '执行': 'run',
  'run': 'run',
  '分析': 'analyze',
  'analyze': 'analyze',
  'explain': 'explain',
  '解释': 'explain',
  '查看': 'search',
  '查找': 'search',
  '搜索': 'search',
  'search': 'search',
  '创建': 'create',
  '新建': 'create',
  'delete': 'delete',
  '删除': 'delete',
};

/**
 * CI/CD 相关关键字
 */
export const CI_CONTEXT_KEYWORDS = [
  'actions', 'workflow', 'ci', 'github', 'gh',
  'checks', 'pipeline', 'action',
];

/**
 * 动作映射：标准化术语 -> GoalAction
 */
export const ACTION_MAP: Record<string, GoalAction> = {
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

/**
 * 范围映射：标准化术语 -> GoalScope
 */
export const SCOPE_MAP: Record<string, GoalScope> = {
  '所有': 'all',
  '全部': 'all',
  'all': 'all',
  '这些': 'selected',
  '当前': 'current',
  '最新': 'latest',
  'latest': 'latest',
};

/**
 * 失败相关术语
 */
export const FAILURE_TERMS = ['failure', '错误', '失败', 'failed', 'error', '挂了', '红了', '不通过', 'green', '绿'];

/**
 * 领域关键字定义
 */
export const DOMAIN_KEYWORDS = {
  CI: ['ci', 'github-actions', 'actions', 'action'],
  GITHUB: ['github', 'github-actions'],
  GIT: ['git', 'commit', 'push', 'pull', 'branch', 'merge'],
  NPM: ['npm', 'build', 'lint'],
  TEST: ['test', '测试'],
  WORKFLOW: ['workflow', 'ci'],
};

/**
 * 领域冲突规则判断函数
 * 
 * 规则 1: git + actions/ci/workflow + failure -> github-actions 优先
 * 规则 2: git + commit/push/pull/branch/merge 且无 ci/failure -> git-workflow
 * 规则 3: repair + business noun 且无 ci/github evidence -> 不进入 github-actions
 * 规则 4: run + test/build/lint -> package-script 或 test domain
 */
export function resolveDomainConflicts(terms: string[], entities: any): string[] {
  const domains: string[] = [];
  const lowerTerms = terms.map(t => t.toLowerCase());

  const hasCiKeyword = lowerTerms.some(t => DOMAIN_KEYWORDS.CI.includes(t));
  const hasGithubKeyword = lowerTerms.some(t => DOMAIN_KEYWORDS.GITHUB.includes(t));
  const hasGitKeyword = lowerTerms.some(t => DOMAIN_KEYWORDS.GIT.includes(t));
  const hasNpmKeyword = lowerTerms.some(t => DOMAIN_KEYWORDS.NPM.includes(t));
  const hasTestKeyword = lowerTerms.some(t => DOMAIN_KEYWORDS.TEST.includes(t));
  const hasWorkflowKeyword = lowerTerms.some(t => DOMAIN_KEYWORDS.WORKFLOW.includes(t));
  const hasFailureTerm = lowerTerms.some(t => FAILURE_TERMS.includes(t));
  const hasActionKeyword = lowerTerms.some(t => ['action'].includes(t));

  // 规则 1: git + actions/ci/workflow + failure -> github-actions 优先
  if (hasGithubKeyword && (hasCiKeyword || hasWorkflowKeyword)) {
    domains.push('github-actions');
  } else if (hasActionKeyword && hasFailureTerm) {
    domains.push('github-actions');
  } else if (hasGitKeyword && (hasCiKeyword || hasWorkflowKeyword) && hasFailureTerm) {
    domains.push('github-actions');
  } else if ((hasCiKeyword || hasWorkflowKeyword) && hasFailureTerm) {
    domains.push('github-actions');
  }

  if (hasCiKeyword && !domains.includes('github-actions')) {
    domains.push('ci');
  }

  // 规则 2: git + commit/push/pull/branch/merge 且无 ci/failure -> git-workflow
  if (hasGitKeyword && !hasGithubKeyword && !hasCiKeyword && !hasWorkflowKeyword) {
    domains.push('git');
  }

  // 规则 4: run + test/build/lint -> package-script 或 test domain
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
