import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { CommandRule, CommandRuleSet } from './types.js';

const COMMAND_RULES_DIR = 'command-rules';

export interface CommandRuleLoaderDeps {
  logger: {
    error: (context: { error: unknown }, message: string) => void;
  };
  getGlobalConfigPath: () => string;
}

export function loadRuleSet(filePath: string, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] {
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: CommandRuleSet = JSON.parse(content);
    return data.rules || [];
  } catch (error) {
    deps.logger.error({ error }, `Failed to load rule set from ${filePath}`);
    throw new Error(`Failed to load command rule set from ${filePath}`, { cause: error });
  }
}

export function loadGlobalBlocklist(deps: CommandRuleLoaderDeps): CommandRule[] {
  const blocklistPath = resolve(deps.getGlobalConfigPath(), 'blocklist.json');
  return loadRuleSet(blocklistPath, deps);
}

export function loadGlobalAllowlist(deps: CommandRuleLoaderDeps): CommandRule[] {
  const allowlistPath = resolve(deps.getGlobalConfigPath(), 'allowlist.json');
  return loadRuleSet(allowlistPath, deps);
}

export function loadProjectBlocklist(projectPath: string | undefined, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] {
  if (!projectPath) {
    return [];
  }
  const blocklistPath = resolve(projectPath, '.vectahub', COMMAND_RULES_DIR, 'blocklist.json');
  return loadRuleSet(blocklistPath, deps);
}

export function loadProjectAllowlist(projectPath: string | undefined, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] {
  if (!projectPath) {
    return [];
  }
  const allowlistPath = resolve(projectPath, '.vectahub', COMMAND_RULES_DIR, 'allowlist.json');
  return loadRuleSet(allowlistPath, deps);
}

export function ensureConfigDir(deps: Pick<CommandRuleLoaderDeps, 'getGlobalConfigPath'>): string {
  return deps.getGlobalConfigPath();
}
