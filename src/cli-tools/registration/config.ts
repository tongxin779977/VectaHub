import { mkdir, writeFile, readFile, access, constants } from 'fs/promises';
import { join, dirname } from 'path';
import type { RegistrationConfig, ValidationResult } from './types.js';
import type { CliTool } from '../types.js';

const CONFIG_PATH = join(process.env.HOME || '.', '.vectahub', 'cli-tools', 'config.json');
const DEFAULT_CONFIG: RegistrationConfig = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  registeredTools: ['git'],
  templates: {
    enabled: ['default'],
  },
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(): Promise<RegistrationConfig> {
  try {
    const configDir = dirname(CONFIG_PATH);
    const dirExists = await pathExists(configDir);
    if (!dirExists) {
      await mkdir(configDir, { recursive: true });
      await saveConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }

    const fileExists = await pathExists(CONFIG_PATH);
    if (!fileExists) {
      await saveConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }

    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: RegistrationConfig): Promise<void> {
  const configDir = dirname(CONFIG_PATH);
  const dirExists = await pathExists(configDir);
  if (!dirExists) {
    await mkdir(configDir, { recursive: true });
  }

  config.lastUpdated = new Date().toISOString();
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function validateToolRegistration(
  tool: CliTool,
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
