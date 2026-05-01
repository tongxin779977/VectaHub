import type { CLIToolsConfig } from '../../utils/config.js';
import { loadConfig as loadAppConfig, getDefaultConfig } from '../../utils/config.js';

export interface RegistrationConfig {
  version: string;
  registeredTools: string[];
  templates: {
    enabled: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function loadConfig(): Promise<RegistrationConfig> {
  const config = await loadAppConfig();
  return config.cli_tools;
}

export async function saveConfig(config: RegistrationConfig): Promise<void> {
  // TODO: 实现保存统一配置的功能
  console.warn('saveConfig: 统一配置保存功能待实现');
}

export function validateToolRegistration(
  tool: any,
  existingConfig: RegistrationConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tool.name) {
    errors.push('工具名称不能为空');
  }

  if (!tool.description) {
    warnings.push('建议添加工具描述');
  }

  if (existingConfig.registeredTools.includes(tool.name)) {
    warnings.push(`工具 ${tool.name} 已经注册`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
