import { describe, expect, it, vi } from 'vitest';
import { runVerification } from './verify.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function createMockEnv(execMock: (cmd: string) => Promise<{ stdout: string; stderr: string }>): IEnvironmentService {
  return {
    getHomePath: vi.fn(() => '/tmp/vectahub-test'),
    getPath: vi.fn((...s: string[]) => s.join('/')),
    resolvePath: vi.fn((...s: string[]) => s.join('/')),
    joinPath: vi.fn((...s: string[]) => s.join('/')),
    getDirname: vi.fn(),
    readFile: vi.fn(),
    readFileAsync: vi.fn(),
    readLines: vi.fn(),
    writeFile: vi.fn(),
    exists: vi.fn(),
    ensureDir: vi.fn(),
    mkdirAsync: vi.fn(),
    readDir: vi.fn(),
    readDirObjects: vi.fn(),
    rm: vi.fn(),
    copyFile: vi.fn(),
    createWriteStream: vi.fn(),
    stat: vi.fn(),
    getTmpDir: vi.fn(() => '/tmp'),
    getEnv: vi.fn(),
    setEnv: vi.fn(),
    deleteEnv: vi.fn(),
    getEnvBoolean: vi.fn(),
    getEnvNumber: vi.fn(),
    getAllEnv: vi.fn(),
    exec: execMock,
    spawn: vi.fn(),
    exit: vi.fn(),
    getArgv: vi.fn(),
    getCwd: vi.fn(),
    getPlatform: vi.fn(() => 'darwin'),
    onSignal: vi.fn(),
    onUncaughtException: vi.fn(),
    onUnhandledRejection: vi.fn(),
    onWarning: vi.fn(),
  } as unknown as IEnvironmentService;
}

describe('verify', () => {
  describe('runTests', () => {
    it('should use a valid vitest reporter (not basic)', async () => {
      const execCalls: string[] = [];
      const mockEnv = createMockEnv(async (cmd: string) => {
        execCalls.push(cmd);
        return { stdout: '5 passed', stderr: '' };
      });

      await runVerification('test', mockEnv);

      const testCmd = execCalls.find(c => c.includes('vitest'));
      expect(testCmd).toBeDefined();
      expect(testCmd).not.toContain('--reporter=basic');
      // Verify it uses a valid vitest reporter
      const validReporters = ['--reporter=default', '--reporter=verbose', '--reporter=dot', '--reporter=json', '--reporter=junit', '--reporter=tap'];
      const usesValidReporter = validReporters.some(r => testCmd!.includes(r));
      expect(usesValidReporter).toBe(true);
    });

    it('should pass when tests succeed', async () => {
      const mockEnv = createMockEnv(async () => ({
        stdout: 'Tests  10 passed (10)',
        stderr: '',
      }));

      const report = await runVerification('test', mockEnv);
      const testCheck = report.checks.find(c => c.name === 'Tests');
      expect(testCheck?.status).toBe('pass');
      expect(testCheck?.detail).toContain('10 passed');
    });

    it('should fail when tests fail', async () => {
      const mockEnv = createMockEnv(async () => ({
        stdout: 'Tests  8 passed | 2 failed (10)',
        stderr: '',
      }));

      const report = await runVerification('test', mockEnv);
      const testCheck = report.checks.find(c => c.name === 'Tests');
      expect(testCheck?.status).toBe('fail');
    });
  });
});
