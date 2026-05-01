import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import type { CommandRule, CommandRuleSet } from './types.js';

const VECTAHUB_DIR = '.vectahub';
const COMMAND_RULES_DIR = 'command-rules';

function getGlobalConfigPath(): string {
  return resolve(homedir(), VECTAHUB_DIR, COMMAND_RULES_DIR);
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
    console.error(`Failed to load rule set from ${filePath}:`, error);
    return [];
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