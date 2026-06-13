import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SandboxManager, createSandboxManager } from './sandbox.js';
import { createNoopAuditHelper } from '../infrastructure/audit/index.js';

// Mock dependencies
vi.mock('../infrastructure/paths/index.js', () => ({
  getVectaHubPath: vi.fn((...args) => `/tmp/vectahub/${args.join('/')}`),
}));

vi.mock('./detector.js', () => ({
  createDetector: vi.fn(() => ({
    detect: vi.fn((cmd) => ({
      isDangerous: cmd.includes('sudo'),
      level: cmd.includes('sudo') ? 'critical' : 'none',
      reason: cmd.includes('sudo') ? 'Dangerous command' : '',
    })),
    isDangerous: vi.fn((cmd) => cmd.includes('sudo')),
    getDangerLevel: vi.fn((cmd) => ({
      level: cmd.includes('sudo') ? 'critical' : 'none',
    })),
  })),
}));

vi.mock('../command-rules/index.js', () => ({
  createCommandRuleEngine: vi.fn(() => ({
    evaluate: vi.fn(() => ({ matched: false, decision: 'allow' })),
  })),
}));

vi.mock('../command-rules/loader.js', () => ({
  loadGlobalBlocklist: vi.fn(() => []),
  loadGlobalAllowlist: vi.fn(() => []),
  loadProjectBlocklist: vi.fn(() => []),
  loadProjectAllowlist: vi.fn(() => []),
}));

vi.mock('../security-protocol/factory.js', () => ({
  createSecurityGuard: vi.fn(() => ({})),
}));

vi.mock('../infrastructure/audit/index.js', () => ({
  performEnvAudit: vi.fn(async () => ({
    platform: 'darwin',
    linuxKernel: { userNamespaces: true },
  })),
  createNoopAuditHelper: vi.fn(() => ({
    log: vi.fn(),
  })),
  AuditEventType: {
    ENV_AUDIT: 'env_audit',
    CONFIG_CHANGE: 'config_change',
  },
}));

describe('SandboxManager', () => {
  describe('createSandboxManager', () => {
    it('should create a SandboxManager instance', () => {
      const manager = createSandboxManager(
        {},
        { audit: createNoopAuditHelper() }
      );
      expect(manager).toBeInstanceOf(SandboxManager);
    });

    it('should use provided config', () => {
      const manager = createSandboxManager(
        { mode: 'STRICT', maxMemoryMB: 1024 },
        { audit: createNoopAuditHelper() }
      );
      const config = manager.getConfig();
      expect(config.mode).toBe('STRICT');
      expect(config.maxMemoryMB).toBe(1024);
    });
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const manager = new SandboxManager(
        {},
        { audit: createNoopAuditHelper() }
      );
      const config = manager.getConfig();
      expect(config.mode).toBe('RELAXED');
    });

    it('should merge partial config with defaults', () => {
      const manager = new SandboxManager(
        { mode: 'STRICT' },
        { audit: createNoopAuditHelper() }
      );
      const config = manager.getConfig();
      expect(config.mode).toBe('STRICT');
      expect(config.maxMemoryMB).toBe(512); // should still use default
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const manager = new SandboxManager(
        { mode: 'STRICT' },
        { audit: createNoopAuditHelper() }
      );
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();
      expect(config1).not.toBe(config2); // different objects
      expect(config1).toEqual(config2); // same content
    });
  });

  describe('setMode', () => {
    it('should update the mode', () => {
      const manager = new SandboxManager(
        { mode: 'STRICT' },
        { audit: createNoopAuditHelper() }
      );
      expect(manager.getConfig().mode).toBe('STRICT');
      
      manager.setMode('RELAXED');
      expect(manager.getConfig().mode).toBe('RELAXED');
    });
  });

  describe('detect and isDangerous', () => {
    it('should delegate detection to the detector', () => {
      const manager = new SandboxManager(
        {},
        { audit: createNoopAuditHelper() }
      );
      
      expect(manager.isDangerous('sudo rm -rf /')).toBe(true);
      expect(manager.isDangerous('ls -la')).toBe(false);
      
      const result = manager.detect('sudo rm -rf /');
      expect(result.isDangerous).toBe(true);
      expect(result.level).toBe('critical');
    });
  });

  describe('getIsolationStrategy', () => {
    it('should return the isolation strategy', () => {
      const manager = new SandboxManager(
        {},
        { audit: createNoopAuditHelper() }
      );
      const strategy = manager.getIsolationStrategy();
      expect(['sandbox-exec', 'bubblewrap', 'unshare', 'directory']).toContain(strategy);
    });
  });

  describe('signCommand and validateCommandSignature', () => {
    it('should sign and validate commands', () => {
      const manager = new SandboxManager(
        {},
        { audit: createNoopAuditHelper() }
      );
      const command = 'ls -la';
      const signature = manager.signCommand(command);
      
      expect(signature.signature).toBeDefined();
      expect(signature.timestamp).toBeDefined();
      expect(signature.algorithm).toBe('sha256');
      
      // Validate the signature
      const validation = manager.validateCommandSignature(command, signature);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const manager = new SandboxManager(
        {},
        { audit: createNoopAuditHelper() }
      );
      const validation = manager.validateCommandSignature('ls', 'invalid-signature');
      expect(validation.valid).toBe(false);
    });
  });

  describe('filterEnv', () => {
    it('should filter environment variables but pass allowed and extra allowed ones', () => {
      const manager = new SandboxManager(
        { allowedEnvVars: ['PATH', 'HOME'] },
        { audit: createNoopAuditHelper() }
      );
      
      const originalPath = process.env.PATH;
      const originalHome = process.env.HOME;
      
      process.env.PATH = '/bin:/usr/bin';
      process.env.HOME = '/home/user';
      process.env.TEST_BLOCKED_KEY = 'secret';
      process.env.TEST_ALLOWED_KEY = 'allowed-secret';

      const userEnv = {
        PATH: '/custom/bin',
        CUSTOM_VAR: 'custom-value',
      };

      const filtered1 = (manager as any).filterEnv(userEnv);
      expect(filtered1.PATH).toBe('/custom/bin');
      expect(filtered1.HOME).toBe('/home/user');
      expect(filtered1.TEST_BLOCKED_KEY).toBeUndefined();
      expect(filtered1.CUSTOM_VAR).toBe('custom-value');

      const filtered2 = (manager as any).filterEnv(userEnv, ['TEST_ALLOWED_KEY']);
      expect(filtered2.TEST_ALLOWED_KEY).toBe('allowed-secret');
      expect(filtered2.TEST_BLOCKED_KEY).toBeUndefined();

      delete process.env.TEST_BLOCKED_KEY;
      delete process.env.TEST_ALLOWED_KEY;
      process.env.PATH = originalPath;
      process.env.HOME = originalHome;
    });
  });
});
