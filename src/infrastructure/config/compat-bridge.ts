import { getDefaultContext } from '../context.js';
import type { Config } from './schema.js';
import {
  getDefaultConfigWithDeps,
  loadConfigWithDeps,
  saveConfigWithDeps,
  updateConfigWithDeps,
  type ConfigFacadeDeps,
} from './facade.js';

function createConfigBridgeDeps(): ConfigFacadeDeps {
  const context = getDefaultContext();
  return {
    environment: context.environment,
    config: context.config,
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 config facade 或 InfrastructureContext.config
 */
export function loadConfig(configPath?: string): Config {
  return loadConfigWithDeps(createConfigBridgeDeps(), configPath);
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 config facade 或 InfrastructureContext.config
 */
export function getDefaultConfig(): Config {
  return getDefaultConfigWithDeps(createConfigBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 config facade 或 InfrastructureContext.config
 */
export function saveConfig(config: Config, configPath?: string): void {
  saveConfigWithDeps(createConfigBridgeDeps(), config, configPath);
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 config facade 或 InfrastructureContext.config
 */
export function updateConfig(patch: Partial<Config>, configPath?: string): Config {
  return updateConfigWithDeps(createConfigBridgeDeps(), patch, configPath);
}
