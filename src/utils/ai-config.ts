import type { AIConfig } from './config.js';
import { loadConfig, getDefaultConfig } from './config.js';

export async function loadAIConfig(): Promise<AIConfig> {
  const config = loadConfig();
  return config.ai;
}

export function getDefaultAIConfig(): AIConfig {
  return getDefaultConfig().ai;
}

export async function saveAIConfig(config: Partial<AIConfig>): Promise<void> {
  // TODO: 实现保存统一配置的功能
  console.warn('saveAIConfig: 统一配置保存功能待实现');
}
