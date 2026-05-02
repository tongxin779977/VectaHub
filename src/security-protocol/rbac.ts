import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const RBAC_FILE = join(homedir(), '.vectahub', 'rbac.json');

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
    blocked_commands: ['rm -rf /', 'mkfs', 'dd of=/dev/', 'shutdown', 'reboot'],
    max_timeout: 300000,
    sandbox_mode: 'RELAXED',
  },
  {
    name: 'ci-runner',
    allowed_tools: ['npm', 'node', 'git', 'tsx'],
    blocked_commands: ['rm -rf /', 'chmod 777', 'sudo', 'mkfs', 'dd', 'shutdown', 'reboot', 'init'],
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
  const dir = join(homedir(), '.vectahub');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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

    if (roleConfig.blocked_commands.some((blocked) => command.includes(blocked))) {
      return false;
    }

    if (tool && roleConfig.allowed_tools.length > 0 && !roleConfig.allowed_tools.includes('*')) {
      return roleConfig.allowed_tools.includes(tool);
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
