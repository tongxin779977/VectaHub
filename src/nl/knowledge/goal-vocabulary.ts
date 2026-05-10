import type { GoalAction, GoalScope, ProjectContext } from '../core/goal-types.js';

export const ACTION_MAP: Record<string, GoalAction> = {
  'run': 'run', 'execute': 'run', '执行': 'run', '运行': 'run',
  'create': 'create', 'generate': 'create', 'build': 'create', 'add': 'create', 'init': 'create', 'scaffold': 'create', 'setup': 'create',
  'modify': 'modify', 'update': 'modify', 'change': 'modify', 'edit': 'modify', 'refactor': 'modify', 'rewrite': 'modify', 'revise': 'modify',
  'delete': 'delete', 'remove': 'delete', 'drop': 'delete', 'destroy': 'delete', 'clear': 'delete', 'erase': 'delete',
  'debug': 'debug', 'fix': 'debug', 'troubleshoot': 'debug', 'resolve': 'debug', 'patch': 'debug', 'hotfix': 'debug',
  'repair': 'repair', '修': 'repair', '修复': 'repair', '修好': 'repair', '修绿': 'repair', '修理': 'repair',
  '处理': 'repair', '解决': 'repair', '搞定': 'repair',
  'git': 'git', 'commit': 'git', '提交': 'git', '推送': 'git', 'pull': 'git', 'push': 'git', 'clone': 'git',
  'test': 'test', 'verify': 'test', 'validate': 'test', 'check': 'test', 'coverage': 'test', 'e2e': 'test',
  'deploy': 'deploy', 'publish': 'deploy', 'release': 'deploy', 'ship': 'deploy', 'rollout': 'deploy',
  'analyze': 'analyze', 'inspect': 'analyze', 'review': 'analyze', 'scan': 'analyze', 'audit': 'analyze', 'profile': 'analyze', 'benchmark': 'analyze',
  '分析': 'analyze', '检查': 'analyze', '审查': 'analyze', '扫描': 'analyze',
  'document': 'document', 'documenting': 'document', 'docs': 'document', 'readme': 'document',
};

export const SCOPE_MAP: Record<string, GoalScope> = {
  'project': 'project', 'repo': 'project', 'repository': 'project', 'monorepo': 'project', 'workspace': 'project',
  'service': 'service', 'microservice': 'service', 'server': 'service', 'api': 'service', 'backend': 'service', 'app': 'service', 'application': 'service',
  'module': 'module', 'package': 'module', 'library': 'module', 'lib': 'module', 'feature': 'module',
  'function': 'function', 'method': 'function', 'fn': 'function', 'func': 'function', 'handler': 'function', 'util': 'function',
  'test': 'test', 'tests': 'test', 'spec': 'test', 'e2e': 'test',
  'deployment': 'deployment', 'deploy': 'deployment', 'infrastructure': 'deployment', 'infra': 'deployment', 'pipeline': 'deployment', 'ci': 'deployment', 'cd': 'deployment',
  'dependency': 'dependency', 'dependencies': 'dependency', 'deps': 'dependency', 'upgrade': 'dependency',
  'config': 'config', 'configuration': 'config', 'settings': 'config', 'env': 'config',
  'ui': 'ui', 'interface': 'ui', 'frontend': 'ui', 'view': 'ui', 'page': 'ui', 'screen': 'ui', 'component': 'ui',
  'database': 'database', 'db': 'database', 'migration': 'database', 'schema': 'database',
  'security': 'security', 'auth': 'security', 'authentication': 'security', 'authorization': 'security',
  'all': 'all', '全部': 'all', '所有': 'all', 'latest': 'latest', '最新': 'latest', '最近': 'latest',
};

export const FAILURE_TERMS: string[] = [
  'failing', 'failed', 'broken', 'error', 'crash', 'bug', 'issue', 'wrong',
  'incorrect', 'unexpected', 'regression', 'timeout', 'not found', 'missing',
  'failure', '错误', '失败', '出错', '报错', '问题',
];

export const CI_CONTEXT_KEYWORDS = [
  'pipeline', 'workflow', 'ci', 'cd', 'github action', 'github-actions', 'gitlab ci', 'jenkins',
  'deploy', 'deployment', 'build', 'release',
];

export const DOMAIN_KEYWORDS: Record<string, string[]> = {
  api: ['endpoint', 'route', 'controller', 'handler', 'request', 'response', 'api', 'rest', 'graphql', 'middleware'],
  database: ['query', 'table', 'migration', 'schema', 'model', 'orm', 'database', 'db', 'sql', 'index'],
  auth: ['login', 'authentication', 'authorization', 'permission', 'role', 'token', 'session', 'jwt', 'oauth'],
  frontend: ['component', 'render', 'ui', 'page', 'view', 'layout', 'style', 'template', 'dom', 'css', 'html'],
  testing: ['test', 'assertion', 'mock', 'coverage', 'spec', 'e2e', 'unit', 'integration', 'jest', 'vitest', '测试', '断言', '覆盖'],
  devops: ['deploy', 'pipeline', 'docker', 'container', 'infrastructure', 'kubernetes', 'terraform'],
  git: ['git', 'commit', '提交', '推送', 'branch', 'merge', 'rebase', 'stash', 'tag', 'remote', 'origin', 'repository'],
  'github-actions': ['github-actions', 'github action', 'workflow', 'action', 'actions', 'gh run', 'gh workflow', 'ci'],
  ci: ['ci', 'cd', 'continuous integration', 'continuous deployment', 'pipeline'],
  performance: ['slow', 'latency', 'memory', 'cpu', 'optimization', 'cache', 'bottleneck', 'timeout', 'performance', 'profile'],
  security: ['vulnerability', 'injection', 'xss', 'csrf', 'authentication', 'authorization', 'sanitization', 'encryption'],
};

export function resolveDomainConflicts(terms: string[], entities: Record<string, unknown>): string[] {
  const domains: string[] = [];
  const lowerTerms = terms.map(t => t.toLowerCase());

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (lowerTerms.some(t => keywords.some(kw => t.includes(kw)))) {
      domains.push(domain);
    }
  }

  if (domains.includes('testing') && domains.includes('devops')) {
    return domains.filter(d => d !== 'testing');
  }

  return domains;
}

export function resolveGoalDomainConflicts(action: GoalAction, context: ProjectContext): { action: GoalAction; reason: string } {
  if (action === 'test') {
    const hasCIKeywords = CI_CONTEXT_KEYWORDS.some(kw =>
      (context.rawInput ?? '').toLowerCase().includes(kw),
    );
    if (hasCIKeywords) {
      return { action: 'deploy', reason: 'CI context detected, interpreting test as deploy' };
    }
  }
  return { action, reason: 'no conflict detected' };
}
