import { IntentCategory } from '../types/category.js';
/**
 * 能力元数据映射
 * 
 * 将核心意图分类与其对应的 Capability 关联，
 * 逐步替代硬编码的 IntentTemplate。
 */
export const CAPABILITY_METADATA = {
  GITHUB_ACTIONS: {
    capabilityId: 'github-actions-repair',
    domains: ['github-actions', 'ci'],
    actions: ['repair', 'analyze'],
    category: IntentCategory.EXECUTE,
  },
  GIT_WORKFLOW: {
    capabilityId: 'git-workflow',
    domains: ['git'],
    actions: ['run'],
    category: IntentCategory.EXECUTE,
  },
  PACKAGE_SCRIPT: {
    capabilityId: 'package-script',
    domains: ['npm', 'test'],
    actions: ['run'],
    category: IntentCategory.EXECUTE,
  },
};

/**
 * 遗留模版白名单
 * 
 * 只有不属于上述 Capability 覆盖范围的模版才保留在 NL Processor 链路中。
 */
export const LEGACY_TEMPLATE_WHITELIST = [
  'FILE_FIND',
  'DIALOG_GREETING',
  'WORKFLOW_GENERATE',
  'GIT_WORKFLOW',
  'INSTALL_PACKAGE',
  'RUN_SCRIPT',
  'CREATE_FILE',
  'FILE_ARCHIVE',
  'FILE_PERMISSION',
  'FILE_DIFF',
  'DOCKER_BUILD',
  'SYSTEM_INFO',
  'QUERY_INFO',
  'NETWORK_INFO',
  'DATA_SCRAPING',
  'CONTENT_SUMMARY',
  'GH_MAINTENANCE',
  'GH_LOG_ANALYZE',
];
