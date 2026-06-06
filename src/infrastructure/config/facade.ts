import type { IConfigService, IEnvironmentService } from '../interfaces/index.js';
import type { Config } from './schema.js';
import { ConfigService } from './service.js';

/**
 * 配置 facade 的显式依赖契约
 */
export interface ConfigFacadeDeps {
  environment: IEnvironmentService;
  config: IConfigService;
}

function createScopedConfigService(environment: IEnvironmentService, configPath: string): ConfigService {
  return new ConfigService(environment, configPath);
}

/**
 * 基于显式依赖加载配置
 */
export function loadConfigWithDeps(deps: ConfigFacadeDeps, configPath?: string): Config {
  if (configPath) {
    return createScopedConfigService(deps.environment, configPath).loadConfig();
  }
  return deps.config.getConfig();
}

/**
 * 基于显式依赖获取默认配置
 */
export function getDefaultConfigWithDeps(deps: Pick<ConfigFacadeDeps, 'config'>): Config {
  return deps.config.getDefaultConfig();
}

/**
 * 基于显式依赖保存配置
 */
export function saveConfigWithDeps(deps: ConfigFacadeDeps, config: Config, configPath?: string): void {
  if (configPath) {
    createScopedConfigService(deps.environment, configPath).saveConfig(config);
    return;
  }
  deps.config.saveConfig(config);
}

/**
 * 基于显式依赖更新配置
 */
export function updateConfigWithDeps(deps: ConfigFacadeDeps, patch: Partial<Config>, configPath?: string): Config {
  if (configPath) {
    const service = createScopedConfigService(deps.environment, configPath);
    service.reloadConfig();
    return service.updateConfig(patch);
  }
  return deps.config.updateConfig(patch);
}
