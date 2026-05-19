import type { DefaultPolicy } from '../../command-rules/types.js';
import { getDefaultContext } from '../context.js';
import { ConfigService } from './service.js';
import type { Config } from './schema.js';
// 从 schema.ts 导出类型，保持向后兼容
export type { Config, AIConfig, AIProviderConfig, ExternalCLIConfig, CLIToolsConfig, AIModuleConfig } from './schema.js';

// 向后兼容的函数（内部使用默认 context）
/**
 * @deprecated 建议使用 InfrastructureContext.config 而不是全局函数
 */
export function loadConfig(configPath?: string): Config {
  const ctx = getDefaultContext();
  // 如果传了自定义路径，需要临时创建新的 ConfigService
  if (configPath) {
    const service = new ConfigService(ctx.environment, configPath);
    return service.loadConfig();
  }
  return ctx.config.getConfig();
}

/**
 * @deprecated 建议使用 InfrastructureContext.config.getDefaultConfig()
 */
export function getDefaultConfig(): Config {
  return getDefaultContext().config.getDefaultConfig();
}

/**
 * @deprecated 建议使用 InfrastructureContext.config.saveConfig()
 */
export function saveConfig(config: Config, configPath?: string): void {
  const ctx = getDefaultContext();
  if (configPath) {
    const service = new ConfigService(ctx.environment, configPath);
    return service.saveConfig(config);
  }
  return ctx.config.saveConfig(config);
}

/**
 * @deprecated 建议使用 InfrastructureContext.config.updateConfig()
 */
export function updateConfig(patch: Partial<Config>, configPath?: string): Config {
  const ctx = getDefaultContext();
  if (configPath) {
    const service = new ConfigService(ctx.environment, configPath);
    // 先加载，再更新
    const current = service.loadConfig();
    // 创建临时服务来更新
    const tempService = new ConfigService(ctx.environment, configPath);
    (tempService as any).cachedConfig = current;
    return tempService.updateConfig(patch);
  }
  return ctx.config.updateConfig(patch);
}

// 导出 ConfigService
export { ConfigService } from './service.js';