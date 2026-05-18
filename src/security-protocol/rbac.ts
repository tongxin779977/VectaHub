import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { getVectaHubPath, getVectaHubHome } from '../utils/paths.js';
import { ShellTokenizer } from '../utils/shell-tokenizer.js';

const RBAC_FILE = getVectaHubPath('rbac.json');

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

/**
 * Detect variable injection attempts that could bypass RBAC.
 * E.g., CMD="rm -rf /"; $CMD or alias rm='malicious'
 */
const VARIABLE_INJECTION_PATTERNS = [
  /\$\{?\w+\}?/,           // $VAR or ${VAR}
  /`[^`]+`/,               // backtick command substitution
  /\$\([^)]+\)/,           // $(command) substitution
];

const ALIAS_PATTERNS = [
  /^alias\s+/i,
  /^unalias\s+/i,
];

const SHELL_SEPARATORS = /[;&|]{1,2}/;

function detectBypassAttempt(command: string): boolean {
  // Check for variable injection
  for (const pattern of VARIABLE_INJECTION_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  // Check for alias manipulation
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
  // Split by ; && || | while respecting quotes
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

    // Check for shell separators
    if (ch === ';') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++; // skip second &
      continue;
    }
    if (ch === '|' && command[i + 1] === '|') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++; // skip second |
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

function matchBlockedCommand(command: string, blockedPattern: string): boolean {
  const normalizedCommand = command.trim().toLowerCase();
  const normalizedPattern = blockedPattern.trim().toLowerCase();

  if (normalizedCommand === normalizedPattern) {
    return true;
  }

  if (!normalizedPattern.includes('*') && !normalizedPattern.includes('?')) {
    const commandParts = normalizedCommand.split(/\s+/);
    const patternParts = normalizedPattern.split(/\s+/);

    if (patternParts.length > commandParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const commandPart = commandParts[i];

      if (patternPart === '*') {
        continue;
      }

      if (patternPart !== commandPart) {
        return false;
      }
    }

    return true;
  }

  const commandParts = normalizedCommand.split(/\s+/);
  const patternParts = normalizedPattern.split(/\s+/);

  if (patternParts.length > commandParts.length + 1) {
    return false;
  }

  if (patternParts.length === 1) {
    const onlyPattern = patternParts[0];

    if (onlyPattern === '*') {
      return true;
    }

    const isSuffixWildcard = onlyPattern.endsWith('*') && (onlyPattern.match(/\*/g)?.length ?? 0) === 1;
    const isPrefixWildcard = onlyPattern.startsWith('*') && (onlyPattern.match(/\*/g)?.length ?? 0) === 1;

    if (isSuffixWildcard && !isPrefixWildcard) {
      return commandParts.some(part => part.startsWith(onlyPattern.slice(0, -1)));
    }

    if (isPrefixWildcard && !onlyPattern.endsWith('*')) {
      return commandParts.some(part => part.endsWith(onlyPattern.slice(1)));
    }

    const escaped = onlyPattern
      .replace(/[-/\\^$+().|[\]{}]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${escaped}$`);
    return commandParts.some(part => regex.test(part));
  }

  let patternIndex = 0;
  let commandIndex = 0;

  while (patternIndex < patternParts.length && commandIndex < commandParts.length) {
    const patternPart = patternParts[patternIndex];

    if (patternPart === '*') {
      patternIndex++;

      if (patternIndex === patternParts.length) {
        return true;
      }

      const remainingPatternParts = patternParts.slice(patternIndex);
      const remainingCommandParts = commandParts.slice(commandIndex);

      for (let start = 0; start <= remainingCommandParts.length - remainingPatternParts.length; start++) {
        let matches = true;

        for (let i = 0; i < remainingPatternParts.length; i++) {
          const nextPattern = remainingPatternParts[i];
          const nextCommand = remainingCommandParts[start + i];

          if (nextPattern === '*') {
            continue;
          }

          if (nextPattern.includes('*') || nextPattern.includes('?')) {
            const escaped = nextPattern
              .replace(/[-/\\^$+().|[\]{}]/g, '\\$&')
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.');

            if (!new RegExp(`^${escaped}$`).test(nextCommand)) {
              matches = false;
              break;
            }
          } else if (nextPattern !== nextCommand) {
            matches = false;
            break;
          }
        }

        if (matches) {
          return true;
        }
      }

      return false;
    }

    const commandPart = commandParts[commandIndex];

    if (patternPart === '?' || patternPart === commandPart) {
      patternIndex++;
      commandIndex++;
      continue;
    }

    if (patternPart.includes('*') || patternPart.includes('?')) {
      const escaped = patternPart
        .replace(/[-/\\^$+().|[\]{}]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      if (new RegExp(`^${escaped}$`).test(commandPart)) {
        patternIndex++;
        commandIndex++;
        continue;
      }
    }

    return false;
  }

  if (patternIndex < patternParts.length && patternParts.slice(patternIndex).every(part => part === '*')) {
    return true;
  }

  return patternIndex === patternParts.length && commandIndex === commandParts.length;
}

export function createRBACManager(): RBACManager {
  function loadConfig(): RoleConfig[] {
    ensureRbacDir();
    if (!existsSync(RBAC_FILE)) {
      return DEFAULT_ROLES;
    }
    try {
      const raw = readFileSync(RBAC_FILE, 'utf-8');
      return JSON.parse(raw) as RoleConfig[];
    } catch {
      return DEFAULT_ROLES;
    }
  }

  function saveConfig(roles: RoleConfig[]): void {
    ensureRbacDir();
    writeFileSync(RBAC_FILE, JSON.stringify(roles, null, 2), 'utf-8');
  }

  function getRole(name: RoleName): RoleConfig {
    const roles = loadConfig();
    const role = roles.find((r) => r.name === name);
    return role || DEFAULT_ROLES.find((r) => r.name === name)!;
  }

  function getAllRoles(): RoleConfig[] {
    return loadConfig();
  }

  function canExecute(role: RoleName, command: string, tool?: string): boolean {
    const roleConfig = getRole(role);

    // 0. Block variable injection and alias bypass attempts
    if (detectBypassAttempt(command)) {
      return false;
    }

    // 1. Split compound commands by shell separators and check each part
    const compoundParts = splitCompoundCommand(command);

    for (const part of compoundParts) {
      // Also tokenize via ShellTokenizer for deeper analysis
      const subCommands = ShellTokenizer.tokenize(part);

      for (const subCmd of subCommands) {
        const normalizedSubCmd = subCmd.raw.toLowerCase();

        // Check blocked commands
        for (const blocked of roleConfig.blocked_commands) {
          if (matchBlockedCommand(normalizedSubCmd, blocked)) {
            return false;
          }
        }

        // Check allowed tools
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

  function getMaxTimeout(role: RoleName): number {
    return getRole(role).max_timeout;
  }

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
