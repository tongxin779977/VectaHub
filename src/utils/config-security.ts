import {
  ConfigSecurity as InfrastructureConfigSecurity,
  type ConfigSecurityDeps,
  type ConfigSecurityOptions,
} from '../infrastructure/security/config-security.js';
import { LoggerService } from '../infrastructure/logger/service.js';
import { getLoggerWithDeps } from '../infrastructure/logger/facade.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function createCompatDeps(environment: IEnvironmentService): ConfigSecurityDeps {
  const loggerService = new LoggerService(environment);
  return {
    logger: getLoggerWithDeps({ logger: loggerService }, 'config-security'),
    resolveStoragePath: (...segments: string[]) => environment.getPath(...segments),
  };
}

/**
 * 兼容桥接层：为历史构造签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/security/config-security 中的显式依赖 API
 */
export class ConfigSecurity extends InfrastructureConfigSecurity {
  constructor(environment: IEnvironmentService, options?: ConfigSecurityOptions) {
    super({ ...options, deps: createCompatDeps(environment) });
  }
}

/**
 * 兼容桥接层：为历史工厂签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/security/config-security 中的显式依赖 API
 */
export function createConfigSecurity(environment: IEnvironmentService, options?: ConfigSecurityOptions): ConfigSecurity {
  return new ConfigSecurity(environment, options);
}

export type { ConfigChange, ConfigSecurityCreateOptions, ConfigSecurityDeps, ConfigSecurityOptions, SecurityIssue, SecurityStatus } from '../infrastructure/security/config-security.js';
