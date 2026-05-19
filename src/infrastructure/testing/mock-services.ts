import pino from 'pino';
import type { IEnvironmentService, ILoggerService } from '../interfaces/index.js';
import { Signal } from '../interfaces/environment-service.js';

/**
 * 内存日志服务，用于测试时捕获日志输出而不写入控制台或文件
 */
export class MockLoggerService implements ILoggerService {
  private level: pino.Level | 'silent' = 'info';
  private muted = false;
  readonly logs: any[] = [];

  setLogLevel(level: pino.Level | 'silent'): void { this.level = level; }
  getLogLevel(): pino.Level | 'silent' { return this.level; }
  setMuted(muted: boolean): void { this.muted = muted; }
  isMuted(): boolean { return this.muted; }

  private createMockLogger(name: string): pino.Logger {
    return pino({ name, level: this.muted ? 'silent' : this.level }, {
      write: (msg: string) => {
        this.logs.push(JSON.parse(msg));
      }
    }) as unknown as pino.Logger;
  }

  createConsoleLogger(prefix = ''): pino.Logger { return this.createMockLogger(prefix || 'mock-console'); }
  createFileLogger(prefix = ''): pino.Logger { return this.createMockLogger(prefix || 'mock-file'); }
  getLogger(prefix = ''): pino.Logger { return this.createMockLogger(prefix || 'mock'); }
}

/**
 * 内存环境服务，用于测试时完全隔离文件系统和环境变量
 */
export class MockEnvironmentService implements IEnvironmentService {
  private files = new Map<string, string>();
  private env = new Map<string, string>();
  private cwd = '/test/cwd';
  private home = '/test/home';

  getHomePath(): string { return this.home; }
  getPath(...segments: string[]): string { return [this.home, ...segments].join('/'); }
  resolvePath(...segments: string[]): string { return segments.join('/'); }

  readFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }
  async readFileAsync(path: string): Promise<string> { return this.readFile(path); }
  async *readLines(path: string): AsyncIterable<string> {
    const lines = this.readFile(path).split('\n');
    for (const line of lines) yield line;
  }
  writeFile(path: string, content: string): void { this.files.set(path, content); }
  exists(path: string): boolean { return this.files.has(path); }
  ensureDir(_path: string): void {}
  async mkdirAsync(_path: string): Promise<void> {}
  readDir(path: string): string[] {
    return Array.from(this.files.keys())
      .filter(p => p.startsWith(path))
      .map(p => p.slice(path.length).split('/')[1])
      .filter(Boolean);
  }
  readDirObjects(_path: string): any[] { return []; }
  rm(path: string): void { this.files.delete(path); }
  copyFile(src: string, dest: string): void { this.writeFile(dest, this.readFile(src)); }
  createWriteStream(_path: string): any { return { write: () => {}, end: () => {} }; }
  stat(_path: string): any { return { size: 0, isDirectory: () => false }; }
  getTmpDir(): string { return '/test/tmp'; }

  getEnv(name: string, defaultValue?: string): string | undefined { return this.env.get(name) ?? defaultValue; }
  setEnv(name: string, value: string): void { this.env.set(name, value); }
  deleteEnv(name: string): void { this.env.delete(name); }
  getEnvBoolean(name: string, defaultValue = false): boolean {
    const val = this.getEnv(name);
    return val ? val === 'true' : defaultValue;
  }
  getEnvNumber(name: string, defaultValue?: number): number | undefined {
    const val = this.getEnv(name);
    return val ? Number(val) : defaultValue;
  }
  getAllEnv(): Record<string, string | undefined> {
    const res: Record<string, string | undefined> = {};
    this.env.forEach((v, k) => res[k] = v);
    return res;
  }

  async exec(_cmd: string): Promise<{ stdout: string; stderr: string }> { return { stdout: '', stderr: '' }; }
  spawn(): any { return {}; }
  exit(code = 0): never { throw new Error(`Process exited with code ${code}`); }
  getArgv(): string[] { return []; }
  getCwd(): string { return this.cwd; }

  onSignal(_sig: Signal, _l: any): void {}
  onUncaughtException(_l: any): void {}
  onUnhandledRejection(_l: any): void {}
  onWarning(_l: any): void {}
}
