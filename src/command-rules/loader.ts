import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { CommandRule, CommandRuleSet } from './types.js';
import { getDefaultContext } from '../infrastructure/context.js';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

const COMMAND_RULES_DIR = 'command-rules';
const logger = getDefaultContext().logger.getLogger('command-rules-loader');

function getGlobalConfigPath(): string {
  return getVectaHubPath(COMMAND_RULES_DIR);
}

export function loadRuleSet(filePath: string): CommandRule[] {
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: CommandRuleSet = JSON.parse(content);
    return data.rules || [];
  } catch (error) {
    logger.error({ error }, `Failed to load rule set from ${filePath}`);
    throw new Error(`Failed to load command rule set from ${filePath}`, { cause: error });
  }
}

export function loadGlobalBlocklist(): CommandRule[] {
  const blocklistPath = resolve(getGlobalConfigPath(), 'blocklist.json');
  return loadRuleSet(blocklistPath);
}

export function loadGlobalAllowlist(): CommandRule[] {
  const allowlistPath = resolve(getGlobalConfigPath(), 'allowlist.json');
  return loadRuleSet(allowlistPath);
}

export function loadProjectBlocklist(projectPath?: string): CommandRule[] {
  if (!projectPath) {
    return [];
  }
  const blocklistPath = resolve(projectPath, '.vectahub', COMMAND_RULES_DIR, 'blocklist.json');
  return loadRuleSet(blocklistPath);
}

export function loadProjectAllowlist(projectPath?: string): CommandRule[] {
  if (!projectPath) {
    return [];
  }
  const allowlistPath = resolve(projectPath, '.vectahub', COMMAND_RULES_DIR, 'allowlist.json');
  return loadRuleSet(allowlistPath);
}

export function ensureConfigDir(): string {
  const configPath = getGlobalConfigPath();
  return configPath;
}
