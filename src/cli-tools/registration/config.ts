import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { stringify } from 'yaml';
import type { IConfigService } from '../../infrastructure/interfaces/index.js';
import { getVectaHubPath } from '../../infrastructure/paths/index.js';
import type { RegistrationConfig, ValidationResult } from './types.js';

interface ToolRegistrationCandidate {
  name?: string;
  description?: string;
}

function getConfigPath(): string {
  return getVectaHubPath('config.yaml');
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

export async function loadConfig(configService?: IConfigService): Promise<RegistrationConfig> {
  if (testMode && testConfig) {
    return { ...testConfig };
  }
  if (!configService) {
    throw new Error('configService is required when not in test mode');
  }
  const config = configService.getConfig();
  return config.cli_tools;
}

export async function saveConfig(config: RegistrationConfig, configService?: IConfigService): Promise<void> {
  if (testMode) {
    testConfig = { ...config };
    return;
  }

  if (!configService) {
    throw new Error('configService is required when not in test mode');
  }

  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const currentConfig = configService.getConfig();
  currentConfig.cli_tools = config;

  const content = stringify(currentConfig);

  try {
    writeFileSync(configPath, content, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error) {
      throw new Error(`Failed to save config: ${message}`, { cause: error });
    }
    throw error;
  }
}

export function validateToolRegistration(
  tool: ToolRegistrationCandidate,
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

  if (tool.name && existingConfig.registeredTools.includes(tool.name)) {
    warnings.push(`工具 ${tool.name} 已经注册`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
