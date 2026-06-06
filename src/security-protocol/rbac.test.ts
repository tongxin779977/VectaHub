import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRBACManager, type RoleName } from './rbac.js';
import { resetDefaultContext } from '../infrastructure/context.js';

const originalVectaHubHome = process.env.VECTAHUB_HOME;

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('rbac', () => {
  beforeEach(() => {
    resetDefaultContext();
  });

  afterEach(() => {
    restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
    resetDefaultContext();
  });

  it('gets default developer role', () => {
    const manager = createRBACManager();
    const role = manager.getRole('developer');

    expect(role.name).toBe('developer');
    expect(role.allowed_tools).toContain('git');
    expect(role.sandbox_mode).toBe('RELAXED');
  });

  it('gets all three default roles', () => {
    const manager = createRBACManager();
    const roles = manager.getAllRoles();

    expect(roles.length).toBe(3);
    expect(roles.map(r => r.name)).toContain('developer');
    expect(roles.map(r => r.name)).toContain('ci-runner');
    expect(roles.map(r => r.name)).toContain('admin');
  });

  it('developer can use git', () => {
    const manager = createRBACManager();
    expect(manager.canExecute('developer', 'git status', 'git')).toBe(true);
  });

  it('ci-runner blocked on sudo', () => {
    const manager = createRBACManager();
    expect(manager.canExecute('ci-runner', 'sudo rm -rf /', 'sudo')).toBe(false);
  });

  it('ci-runner blocked on rm -rf /', () => {
    const manager = createRBACManager();
    expect(manager.canExecute('ci-runner', 'rm -rf /', 'rm')).toBe(false);
  });

  it('admin can execute any command', () => {
    const manager = createRBACManager();
    expect(manager.canExecute('admin', 'rm -rf /', 'rm')).toBe(true);
  });

  it('ci-runner cannot use opencli tool', () => {
    const manager = createRBACManager();
    expect(manager.canExecute('ci-runner', 'opencli list', 'opencli')).toBe(false);
  });

  it('gets max timeout for roles', () => {
    const manager = createRBACManager();
    expect(manager.getMaxTimeout('developer')).toBe(300000);
    expect(manager.getMaxTimeout('ci-runner')).toBe(600000);
    expect(manager.getMaxTimeout('admin')).toBe(3600000);
  });

  it('gets sandbox mode for roles', () => {
    const manager = createRBACManager();
    expect(manager.getSandboxMode('developer')).toBe('RELAXED');
    expect(manager.getSandboxMode('ci-runner')).toBe('STRICT');
    expect(manager.getSandboxMode('admin')).toBe('CONSENSUS');
  });

  it('recomputes RBAC file path after VECTAHUB_HOME changes', () => {
    process.env.VECTAHUB_HOME = '/tmp/vectahub-rbac-home-a';
    resetDefaultContext();

    const managerA = createRBACManager();
    managerA.saveConfig([
      {
        name: 'developer',
        allowed_tools: ['git'],
        blocked_commands: [],
        max_timeout: 1,
        sandbox_mode: 'RELAXED',
      },
      {
        name: 'ci-runner',
        allowed_tools: ['npm'],
        blocked_commands: [],
        max_timeout: 2,
        sandbox_mode: 'STRICT',
      },
      {
        name: 'admin',
        allowed_tools: ['*'],
        blocked_commands: [],
        max_timeout: 3,
        sandbox_mode: 'CONSENSUS',
      },
    ]);

    process.env.VECTAHUB_HOME = '/tmp/vectahub-rbac-home-b';
    resetDefaultContext();
    mkdirSync('/tmp/vectahub-rbac-home-b', { recursive: true });

    const managerB = createRBACManager();
    managerB.saveConfig([
      {
        name: 'developer',
        allowed_tools: ['docker'],
        blocked_commands: [],
        max_timeout: 4,
        sandbox_mode: 'RELAXED',
      },
      {
        name: 'ci-runner',
        allowed_tools: ['tsx'],
        blocked_commands: [],
        max_timeout: 5,
        sandbox_mode: 'STRICT',
      },
      {
        name: 'admin',
        allowed_tools: ['*'],
        blocked_commands: [],
        max_timeout: 6,
        sandbox_mode: 'CONSENSUS',
      },
    ]);

    const savedA = JSON.parse(readFileSync(join('/tmp/vectahub-rbac-home-a', 'rbac.json'), 'utf-8')) as RoleName[];
    const savedB = JSON.parse(readFileSync(join('/tmp/vectahub-rbac-home-b', 'rbac.json'), 'utf-8')) as RoleName[];

    expect(savedA).not.toEqual(savedB);
  });

  describe('bypass protection', () => {
    it('blocks variable injection: $CMD', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('developer', 'echo $CMD', 'node')).toBe(false);
    });

    it('blocks variable injection: ${VAR}', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('developer', 'echo ${DANGEROUS_CMD}', 'node')).toBe(false);
    });

    it('blocks backtick command substitution', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('developer', 'echo `rm -rf /`', 'node')).toBe(false);
    });

    it('blocks $() command substitution', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('developer', 'echo $(rm -rf /)', 'node')).toBe(false);
    });

    it('blocks alias manipulation', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('developer', 'alias rm="rm -rf /"', 'node')).toBe(false);
    });

    it('blocks compound commands with ; containing blocked commands', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('ci-runner', 'npm test; sudo rm -rf /', 'npm')).toBe(false);
    });

    it('blocks compound commands with && containing blocked commands', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('ci-runner', 'npm test && sudo reboot', 'npm')).toBe(false);
    });

    it('blocks compound commands with | containing blocked commands', () => {
      const manager = createRBACManager();
      // The pipe creates a sub-command that should be checked
      expect(manager.canExecute('ci-runner', 'echo test | sudo bash', 'node')).toBe(false);
    });

    it('allows safe compound commands', () => {
      const manager = createRBACManager();
      expect(manager.canExecute('developer', 'git status && npm test', 'git')).toBe(true);
    });

    it('admin bypasses all restrictions (except variable injection)', () => {
      const manager = createRBACManager();
      // Admin can execute blocked commands but not variable injection
      expect(manager.canExecute('admin', 'rm -rf /', 'rm')).toBe(true);
      expect(manager.canExecute('admin', 'sudo reboot', 'sudo')).toBe(true);
    });

    it('developer cannot use disallowed tool in compound command', () => {
      const manager = createRBACManager();
      // docker is allowed, but opencli is not in developer's ci-runner list
      expect(manager.canExecute('ci-runner', 'git status && opencli list', 'git')).toBe(false);
    });
  });

  describe('logger dependency', () => {
    it('should not produce side effects when no logger is provided', () => {
      const manager = createRBACManager();
      expect(manager).toBeDefined();
      expect(manager.getAllRoles().length).toBeGreaterThan(0);
    });

    it('should call injected logger.warn when config load fails', () => {
      const tmpHome = join('/tmp', `vectahub-rbac-logger-${Date.now()}`);
      mkdirSync(tmpHome, { recursive: true });
      writeFileSync(join(tmpHome, 'rbac.json'), 'not-valid-json', 'utf-8');

      process.env.VECTAHUB_HOME = tmpHome;
      resetDefaultContext();

      const warn = vi.fn();
      const manager = createRBACManager({ logger: { warn } });

      expect(manager.getAllRoles().length).toBeGreaterThan(0);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[RBAC]'),
        expect.any(Error),
      );
    });
  });
});
