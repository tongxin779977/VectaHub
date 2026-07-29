import { describe, it, expect, vi } from 'vitest';
import { createSandbox } from './sandbox.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
  };
});

const env = new MockEnvironmentService();

describe('Sandbox', () => {
  describe('STRICT mode', () => {
    const sandbox = createSandbox('STRICT', env);

    it('should block all dangerous commands', () => {
      expect(sandbox.shouldBlock('sudo rm -rf /')).toBe(true);
      expect(sandbox.shouldBlock('chmod 777 /')).toBe(true);
      expect(sandbox.shouldBlock('echo test > /etc/passwd')).toBe(true);
      expect(sandbox.shouldBlock('rm -rf node_modules')).toBe(true);
    });

    it('should not block safe commands', () => {
      expect(sandbox.shouldBlock('ls -la')).toBe(false);
      expect(sandbox.shouldBlock('echo hello')).toBe(false);
    });

    it('should correctly identify dangerous commands', () => {
      expect(sandbox.isDangerous('sudo rm -rf /')).toBe(true);
      expect(sandbox.isDangerous('ls')).toBe(false);
    });
  });

  describe('RELAXED mode', () => {
    const sandbox = createSandbox('RELAXED', env);

    it('should block critical and high level commands', () => {
      expect(sandbox.shouldBlock('sudo rm -rf /')).toBe(true);
      expect(sandbox.shouldBlock('chmod 777 /')).toBe(true);
      expect(sandbox.shouldBlock('echo test > /etc/passwd')).toBe(true);
    });

    it('should not block medium and low level commands', () => {
      expect(sandbox.shouldBlock('echo test > /dev/sda')).toBe(false);
      expect(sandbox.shouldBlock('ls | grep test')).toBe(false);
      expect(sandbox.shouldBlock('rm -rf node_modules')).toBe(false);
      expect(sandbox.shouldBlock('npm install -g typescript')).toBe(false);
    });

    it('should not block safe commands', () => {
      expect(sandbox.shouldBlock('ls -la')).toBe(false);
    });
  });

  describe('CONSENSUS mode', () => {
    const sandbox = createSandbox('CONSENSUS', env);

    it('should not block any commands', () => {
      expect(sandbox.shouldBlock('sudo rm -rf /')).toBe(false);
      expect(sandbox.shouldBlock('chmod 777 /')).toBe(false);
      expect(sandbox.shouldBlock('ls -la')).toBe(false);
    });

    it('should still identify dangerous commands', () => {
      expect(sandbox.isDangerous('sudo rm -rf /')).toBe(true);
      expect(sandbox.isDangerous('ls')).toBe(false);
    });
  });

  describe('setMode', () => {
    it('should update the mode', () => {
      const sandbox = createSandbox('STRICT', env);
      expect(sandbox.mode).toBe('STRICT');

      sandbox.setMode('RELAXED');
      expect(sandbox.mode).toBe('RELAXED');

      sandbox.setMode('CONSENSUS');
      expect(sandbox.mode).toBe('CONSENSUS');
    });

    it('should apply new mode immediately', () => {
      const sandbox = createSandbox('STRICT', env);
      expect(sandbox.shouldBlock('rm -rf node_modules')).toBe(true);

      sandbox.setMode('RELAXED');
      expect(sandbox.shouldBlock('rm -rf node_modules')).toBe(false);
    });
  });
});