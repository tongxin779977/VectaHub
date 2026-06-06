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

function isCommandRuleSet(data: unknown): data is CommandRuleSet {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== 'string' || typeof obj.description !== 'string') {
    return false;
  }
  if (!Array.isArray(obj.rules)) {
    return false;
  }
  return obj.rules.every(
    (rule: unknown) =>
      typeof rule === 'object' &&
      rule !== null &&
      typeof (rule as Record<string, unknown>).id === 'string' &&
      typeof (rule as Record<string, unknown>).pattern === 'string' &&
      ((rule as Record<string, unknown>).action === 'block' || (rule as Record<string, unknown>).action === 'allow'),
  );
}

/** Load a command rule set from a JSON file. Returns an empty array when the file does not exist. */
export function loadRuleSet(filePath: string, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] {
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: unknown = JSON.parse(content);
    if (!isCommandRuleSet(data)) {
      throw new Error(`Invalid command rule set structure in ${filePath}`);
    }
    return data.rules;
  } catch (error) {
    deps.logger.error({ error }, `Failed to load rule set from ${filePath}`);
    throw new Error(`Failed to load command rule set from ${filePath}`, { cause: error });
  }
}

/** Load the global blocklist from the user-level config directory. */
export function loadGlobalBlocklist(deps: CommandRuleLoaderDeps): CommandRule[] {
  const blocklistPath = resolve(deps.getGlobalConfigPath(), 'blocklist.json');
  return loadRuleSet(blocklistPath, deps);
}

/** Load the global allowlist from the user-level config directory. */
export function loadGlobalAllowlist(deps: CommandRuleLoaderDeps): CommandRule[] {
  const allowlistPath = resolve(deps.getGlobalConfigPath(), 'allowlist.json');
  return loadRuleSet(allowlistPath, deps);
}

/** Load the project-level blocklist from `<projectPath>/.vectahub/command-rules/`. */
export function loadProjectBlocklist(projectPath: string | undefined, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] {
  if (!projectPath) {
    return [];
  }
  const blocklistPath = resolve(projectPath, '.vectahub', COMMAND_RULES_DIR, 'blocklist.json');
  return loadRuleSet(blocklistPath, deps);
}

/** Load the project-level allowlist from `<projectPath>/.vectahub/command-rules/`. */
export function loadProjectAllowlist(projectPath: string | undefined, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] {
  if (!projectPath) {
    return [];
  }
  const allowlistPath = resolve(projectPath, '.vectahub', COMMAND_RULES_DIR, 'allowlist.json');
  return loadRuleSet(allowlistPath, deps);
}

/** Resolve and return the global config directory path. */
export function ensureConfigDir(deps: Pick<CommandRuleLoaderDeps, 'getGlobalConfigPath'>): string {
  return deps.getGlobalConfigPath();
}
