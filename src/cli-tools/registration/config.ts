import type { CLIToolsConfig, Config } from '../../utils/config.js';
import { loadConfig as loadAppConfig, getDefaultConfig } from '../../utils/config.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { stringify } from 'yaml';

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

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return join(homeDir, '.vectahub', 'config.yaml');
}

let testMode = false;
let testConfig: RegistrationConfig | null = null;

export function setTestMode(enabled: boolean): void {
  testMode = enabled;
  if (enabled) {
    testConfig = {
      version: '1.0.0',
      registeredTools: ['git'],
      templates: { enabled: ['default'] },
    };
  } else {
    testConfig = null;
  }
}

export async function loadConfig(): Promise<RegistrationConfig> {
  if (testMode && testConfig) {
    return { ...testConfig };
  }
  const config = await loadAppConfig();
  return config.cli_tools;
}

export async function saveConfig(config: RegistrationConfig): Promise<void> {
  if (testMode) {
    testConfig = { ...config };
    return;
  }

  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const currentConfig = await loadAppConfig();
  currentConfig.cli_tools = config;

  const content = stringify(currentConfig);
  writeFileSync(configPath, content, 'utf-8');
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
