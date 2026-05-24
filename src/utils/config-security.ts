import {
  ConfigSecurity as InfrastructureConfigSecurity,
  type ConfigSecurityDeps,
  type ConfigSecurityOptions,
} from '../infrastructure/security/config-security.js';
import { getLogger } from '../infrastructure/logger/index.js';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

function createCompatDeps(): ConfigSecurityDeps {
  return {
    logger: getLogger('config-security'),
    resolveStoragePath: getVectaHubPath,
  };
}

/**
 * 兼容桥接层：为历史构造签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/security/config-security 中的显式依赖 API
 */
export class ConfigSecurity extends InfrastructureConfigSecurity {
  constructor(options?: ConfigSecurityOptions) {
    super({ ...options, deps: createCompatDeps() });
  }
}

/**
 * 兼容桥接层：为历史工厂签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/security/config-security 中的显式依赖 API
 */
export function createConfigSecurity(options?: ConfigSecurityOptions): ConfigSecurity {
  return new ConfigSecurity(options);
}

export type { ConfigChange, ConfigSecurityCreateOptions, ConfigSecurityDeps, ConfigSecurityOptions, SecurityIssue, SecurityStatus } from '../infrastructure/security/config-security.js';
