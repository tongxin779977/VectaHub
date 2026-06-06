// 从 schema.ts 导出类型，保持向后兼容
export type { Config, AIConfig, AIProviderConfig, ExternalCLIConfig, CLIToolsConfig, AIModuleConfig } from './schema.js';
export {
  getDefaultConfigWithDeps,
  loadConfigWithDeps,
  saveConfigWithDeps,
  updateConfigWithDeps,
  type ConfigFacadeDeps,
} from './facade.js';
export { getDefaultConfig, loadConfig, saveConfig, updateConfig } from './compat-bridge.js';
export { ConfigService } from './service.js';
