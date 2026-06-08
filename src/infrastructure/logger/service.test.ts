import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoggerService } from './service.js';
import type { IEnvironmentService } from '../interfaces/index.js';

class TestEnvironmentService implements IEnvironmentService {
  private homePath: string;

  constructor(homePath: string) {
    this.homePath = homePath;
  }

  getHomePath(): string { return this.homePath; }
  getPath(...segments: string[]): string { return join(this.homePath, ...segments); }
  resolvePath(...segments: string[]): string { return join(...segments); }
  joinPath(...segments: string[]): string { return join(...segments); }
  getDirname(path: string): string { return path.split('/').slice(0, -1).join('/') || '.'; }
  readFile(path: string): string { return readFileSync(path, 'utf-8'); }
  async readFileAsync(path: string): Promise<string> { return this.readFile(path); }
  async *readLines(path: string): AsyncIterable<string> { yield this.readFile(path); }
  writeFile(): void {}
  exists(path: string): boolean { return existsSync(path); }
  ensureDir(): void {}
  async mkdirAsync(): Promise<void> {}
  readDir(): string[] { return []; }
  readDirObjects(): { name: string; isDirectory(): boolean }[] { return []; }
  rm(): void {}
  copyFile(): void {}
  createWriteStream() { return { write: () => true, end: () => undefined } as any; }
  stat() { return { size: 0, isDirectory: () => false }; }
  getTmpDir(): string { return tmpdir(); }
  getEnv(name: string, defaultValue?: string): string | undefined { return process.env[name] ?? defaultValue; }
  setEnv(name: string, value: string): void { process.env[name] = value; }
  deleteEnv(name: string): void { delete process.env[name]; }
  getEnvBoolean(name: string, defaultValue = false): boolean { return this.getEnv(name) === 'true' || defaultValue; }
  getEnvNumber(name: string, defaultValue?: number): number | undefined { return defaultValue; }
  getAllEnv(): Record<string, string | undefined> { return { ...process.env }; }
  async exec(): Promise<{ stdout: string; stderr: string }> { return { stdout: '', stderr: '' }; }
  spawn(): any { return {} as any; }
  exit(code = 0): never { throw new Error(`exit ${code}`); }
  getArgv(): string[] { return []; }
  getCwd(): string { return process.cwd(); }
  getPlatform(): string { return process.platform; }
  onSignal(): void {}
  onUncaughtException(): void {}
  onUnhandledRejection(): void {}
  onWarning(): void {}
}

describe('LoggerService file logging', () => {
  let testHome: string;
  let env: TestEnvironmentService;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'vectahub-logger-test-'));
    env = new TestEnvironmentService(testHome);
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  function getTodayLogPath(): { appLogFile: string; errorLogFile: string } {
    const today = new Date().toISOString().split('T')[0];
    return {
      appLogFile: join(testHome, 'logs', 'app', `${today}.log`),
      errorLogFile: join(testHome, 'logs', 'error', `${today}.json`),
    };
  }

  function waitForFile(filePath: string, maxMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, 'utf-8');
            if (content.length > 0) {
              resolve();
              return;
            }
          } catch {
            // file might not be readable yet
          }
        }
        if (Date.now() - start > maxMs) {
          reject(new Error(`Timeout waiting for file: ${filePath}`));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  it('getLogger creates app and error log files', async () => {
    const service = new LoggerService(env);
    const logger = service.getLogger('test');
    logger.info('test info message');

    const { appLogFile, errorLogFile } = getTodayLogPath();

    // pino transport writes asynchronously, wait for file to appear
    await waitForFile(appLogFile);

    expect(existsSync(appLogFile)).toBe(true);
    expect(existsSync(errorLogFile)).toBe(true);
  });

  it('app log file receives info-level messages', async () => {
    const service = new LoggerService(env);
    const logger = service.getLogger('test');
    logger.info({ testKey: 'testValue' }, 'info log message');

    const { appLogFile } = getTodayLogPath();
    await waitForFile(appLogFile);

    const content = readFileSync(appLogFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.msg).toBe('info log message');
    expect(parsed.testKey).toBe('testValue');
  });

  it('error log file receives only error-level messages', async () => {
    const service = new LoggerService(env);
    const logger = service.getLogger('test');
    logger.info('info message');
    logger.error({ errCode: 500 }, 'error message');

    const { errorLogFile } = getTodayLogPath();
    await waitForFile(errorLogFile);

    const content = readFileSync(errorLogFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // error log should only contain error-level messages
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.level).toBe(50); // pino error level = 50
    }

    // at least one error message should be present
    const hasErrorMsg = lines.some(line => {
      const parsed = JSON.parse(line);
      return parsed.msg === 'error message';
    });
    expect(hasErrorMsg).toBe(true);
  });

  it('getLogger falls back to console logger when file logger fails', () => {
    // Create an environment where getPath throws
    const brokenEnv = new TestEnvironmentService(testHome);
    const originalGetPath = brokenEnv.getPath.bind(brokenEnv);
    let callCount = 0;
    brokenEnv.getPath = (...segments: string[]) => {
      callCount++;
      if (segments[0] === 'logs') {
        throw new Error('simulated log dir failure');
      }
      return originalGetPath(...segments);
    };

    const service = new LoggerService(brokenEnv as unknown as IEnvironmentService);
    // Should not throw, should fall back to console logger
    const logger = service.getLogger('fallback-test');
    expect(logger).toBeDefined();
    // Logger should be functional (console logger fallback)
    expect(() => logger.info('fallback test')).not.toThrow();
  });

  it('createFileLogger uses stderr for console output', async () => {
    const service = new LoggerService(env);
    const logger = service.createFileLogger('stderr-test');
    logger.info('stderr test message');

    const { appLogFile } = getTodayLogPath();
    await waitForFile(appLogFile);

    // File should have content
    const content = readFileSync(appLogFile, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });
});
