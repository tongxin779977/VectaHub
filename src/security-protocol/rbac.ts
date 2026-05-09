import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { getVectaHubPath, getVectaHubHome } from '../utils/paths.js';

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

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    .replace(/\\\*/g, '[^\\s]*')
    .replace(/\\\?/g, '.');
  
  return new RegExp(`^(\\S+\\s+)*${escaped}(\\s+.*)?$`);
}

function matchBlockedCommand(command: string, blockedPattern: string): boolean {
  const normalizedCommand = command.trim().toLowerCase();
  const normalizedPattern = blockedPattern.trim().toLowerCase();

  if (normalizedCommand === normalizedPattern) {
    return true;
  }

  if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
    const regex = patternToRegex(normalizedPattern);
    return regex.test(normalizedCommand);
  }

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

    const normalizedCommand = command.trim().toLowerCase();

    for (const blocked of roleConfig.blocked_commands) {
      if (matchBlockedCommand(normalizedCommand, blocked)) {
        return false;
      }
    }

    if (tool) {
      const normalizedTool = tool.toLowerCase();
      
      if (roleConfig.allowed_tools.length === 0) {
        return false;
      }

      if (roleConfig.allowed_tools.includes('*')) {
        return true;
      }

      if (roleConfig.allowed_tools.some(t => t.toLowerCase() === normalizedTool)) {
        return true;
      }

      return false;
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