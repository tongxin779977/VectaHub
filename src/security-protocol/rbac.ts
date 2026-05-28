import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getVectaHubPath, getVectaHubHome } from '../infrastructure/paths/index.js';
import { ShellTokenizer } from '../utils/shell-tokenizer.js';
import { matchBlockedCommand } from './pattern-matcher.js';

export type RoleName = 'developer' | 'ci-runner' | 'admin';

export interface RoleConfig {
  name: RoleName;
  allowed_tools: string[];
  blocked_commands: string[];
  max_timeout: number;
  sandbox_mode: 'STRICT' | 'RELAXED' | 'CONSENSUS';
}

const DEFAULT_ROLES: RoleConfig[] = [
  {
    name: 'developer',
    allowed_tools: ['git', 'npm', 'node', 'tsx', 'opencli', 'curl', 'docker'],
    blocked_commands: ['rm -rf /', 'mkfs', 'dd of=/dev/*', 'shutdown', 'reboot', 'chmod -R 777 /'],
    max_timeout: 300000,
    sandbox_mode: 'RELAXED',
  },
  {
    name: 'ci-runner',
    allowed_tools: ['npm', 'node', 'git', 'tsx'],
    blocked_commands: ['rm -rf /', 'chmod 777', 'sudo', 'mkfs', 'dd', 'shutdown', 'reboot', 'init', 'rm -rf /*'],
    max_timeout: 600000,
    sandbox_mode: 'STRICT',
  },
  {
    name: 'admin',
    allowed_tools: ['*'],
    blocked_commands: [],
    max_timeout: 3600000,
    sandbox_mode: 'CONSENSUS',
  },
];

export interface RBACManager {
  getRole(name: RoleName): RoleConfig;
  getAllRoles(): RoleConfig[];
  canExecute(role: RoleName, command: string, tool?: string): boolean;
  getMaxTimeout(role: RoleName): number;
  getSandboxMode(role: RoleName): 'STRICT' | 'RELAXED' | 'CONSENSUS';
  saveConfig(roles: RoleConfig[]): void;
  loadConfig(): RoleConfig[];
}

function ensureRbacDir(): void {
  const dir = getVectaHubHome();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getRbacFile(): string {
  return getVectaHubPath('rbac.json');
}

const VARIABLE_INJECTION_PATTERNS = [
  /\$\{?\w+\}?/,
  /`[^`]+`/,
  /\$\([^)]+\)/,
];

const ALIAS_PATTERNS = [
  /^alias\s+/i,
  /^unalias\s+/i,
];

function detectBypassAttempt(command: string): boolean {
  for (const pattern of VARIABLE_INJECTION_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  for (const pattern of ALIAS_PATTERNS) {
    if (pattern.test(command.trim())) return true;
  }
  return false;
}

/**
 * Split compound commands by shell separators (;, &&, ||, |)
 * and return individual sub-commands for checking.
 */
function splitCompoundCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (inSingle) {
      current += ch;
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      continue;
    }

    if (ch === "'") { inSingle = true; current += ch; continue; }
    if (ch === '"') { inDouble = true; current += ch; continue; }

    if (ch === ';') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++;
      continue;
    }
    if (ch === '|' && command[i + 1] === '|') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++;
      continue;
    }
    if (ch === '|') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

/**
 * Creates a Role-Based Access Control manager.
 * Manages role definitions, permission checks, and configuration persistence.
 * Supports compound command splitting, bypass detection, and wildcard pattern matching.
 *
 * @returns An RBACManager instance with role CRUD and execution permission checks
 */
export function createRBACManager(): RBACManager {
  /**
   * Loads role configuration from the RBAC config file.
   * Falls back to default roles if the file is missing or malformed.
   */
  function loadConfig(): RoleConfig[] {
    const rbacFile = getRbacFile();
    ensureRbacDir();
    if (!existsSync(rbacFile)) {
      return DEFAULT_ROLES;
    }
    try {
      const raw = readFileSync(rbacFile, 'utf-8');
      return JSON.parse(raw) as RoleConfig[];
    } catch (error) {
      console.warn('[RBAC] Failed to load config, falling back to defaults:', error instanceof Error ? error.message : String(error));
      return DEFAULT_ROLES;
    }
  }

  /**
   * Persists the given role configuration to disk.
   *
   * @param roles - The role configuration array to save
   */
  function saveConfig(roles: RoleConfig[]): void {
    const rbacFile = getRbacFile();
    ensureRbacDir();
    writeFileSync(rbacFile, JSON.stringify(roles, null, 2), 'utf-8');
  }

  /**
   * Returns the configuration for a specific role.
   *
   * @param name - The role name to look up
   * @returns The role configuration, falling back to defaults if not found
   */
  function getRole(name: RoleName): RoleConfig {
    const roles = loadConfig();
    const role = roles.find((r) => r.name === name);
    return role || DEFAULT_ROLES.find((r) => r.name === name)!;
  }

  /** Returns all configured roles */
  function getAllRoles(): RoleConfig[] {
    return loadConfig();
  }

  /**
   * Checks whether a role is permitted to execute a given command.
   * Performs bypass detection, compound command splitting, blocked command matching,
   * and allowed tool verification.
   *
   * @param role - The role to check permissions for
   * @param command - The command string to evaluate
   * @param _tool - Optional tool name (unused, kept for interface compatibility)
   * @returns true if the command is allowed, false if blocked
   */
  function canExecute(role: RoleName, command: string, _tool?: string): boolean {
    const roleConfig = getRole(role);

    if (detectBypassAttempt(command)) {
      return false;
    }

    const compoundParts = splitCompoundCommand(command);

    for (const part of compoundParts) {
      const subCommands = ShellTokenizer.tokenize(part);

      for (const subCmd of subCommands) {
        const normalizedSubCmd = subCmd.raw.toLowerCase();

        for (const blocked of roleConfig.blocked_commands) {
          if (matchBlockedCommand(normalizedSubCmd, blocked)) {
            return false;
          }
        }

        if (roleConfig.allowed_tools[0] !== '*') {
          const cmdCli = subCmd.cli.toLowerCase();
          const isAllowed = roleConfig.allowed_tools.some(t => t.toLowerCase() === cmdCli);

          if (!isAllowed) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Returns the maximum timeout (in ms) for a given role.
   *
   * @param role - The role name
   */
  function getMaxTimeout(role: RoleName): number {
    return getRole(role).max_timeout;
  }

  /**
   * Returns the sandbox mode for a given role.
   *
   * @param role - The role name
   */
  function getSandboxMode(role: RoleName): 'STRICT' | 'RELAXED' | 'CONSENSUS' {
    return getRole(role).sandbox_mode;
  }

  return {
    getRole,
    getAllRoles,
    canExecute,
    getMaxTimeout,
    getSandboxMode,
    saveConfig,
    loadConfig,
  };
}
