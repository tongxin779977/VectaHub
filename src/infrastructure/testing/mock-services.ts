import pino from 'pino';
import type { IEnvironmentService, ILoggerService } from '../interfaces/index.js';
import { Signal } from '../interfaces/environment-service.js';
import type { ChildProcess, StdioOptions } from 'node:child_process';
import type { WriteStream } from 'node:fs';

type CapturedLog = Record<string, unknown>;

/**
 * 内存日志服务，用于测试时捕获日志输出而不写入控制台或文件
 */
export class MockLoggerService implements ILoggerService {
  private level: pino.Level | 'silent' = 'info';
  private muted = false;
  readonly logs: CapturedLog[] = [];

  setLogLevel(level: pino.Level | 'silent'): void { this.level = level; }
  getLogLevel(): pino.Level | 'silent' { return this.level; }
  setMuted(muted: boolean): void { this.muted = muted; }
  isMuted(): boolean { return this.muted; }

  private createMockLogger(name: string): pino.Logger {
    return pino({ name, level: this.muted ? 'silent' : this.level }, {
      write: (msg: string) => {
        this.logs.push(JSON.parse(msg) as CapturedLog);
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
  joinPath(...segments: string[]): string { return segments.join('/'); }
  getDirname(path: string): string { return path.split('/').slice(0, -1).join('/') || '.'; }

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
  exists(path: string): boolean {
    if (this.files.has(path)) return true;
    const normalizedPath = path.endsWith('/') ? path : path + '/';
    return Array.from(this.files.keys()).some(p => p.startsWith(normalizedPath));
  }
  ensureDir(_path: string): void {}
  async mkdirAsync(_path: string): Promise<void> {}
  readDir(path: string): string[] {
    const normalizedPath = path.endsWith('/') ? path : path + '/';
    const entries = new Set<string>();
    for (const p of this.files.keys()) {
      if (p.startsWith(normalizedPath)) {
        const entry = p.slice(normalizedPath.length).split('/')[0];
        if (entry) entries.add(entry);
      }
    }
    return Array.from(entries);
  }
  readDirObjects(_path: string): { name: string; isDirectory(): boolean }[] { return []; }
  rm(path: string): void { this.files.delete(path); }
  copyFile(src: string, dest: string): void { this.writeFile(dest, this.readFile(src)); }
  createWriteStream(_path: string): WriteStream {
    return {
      write: () => true,
      end: () => undefined,
    } as unknown as WriteStream;
  }
  stat(_path: string): { size: number; isDirectory(): boolean } { return { size: 0, isDirectory: () => false }; }
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
  spawn(_command: string, _args: string[], _options?: { cwd?: string; env?: Record<string, string | undefined>; stdio?: StdioOptions }): ChildProcess {
    return {
      on: () => this.spawn(_command, _args, _options),
    } as unknown as ChildProcess;
  }
  exit(code = 0): never { throw new Error(`Process exited with code ${code}`); }
  getArgv(): string[] { return []; }
  getCwd(): string { return this.cwd; }
  getPlatform(): string { return 'darwin'; }

  onSignal(_sig: Signal, _l: () => void | Promise<void>): void {}
  onUncaughtException(_l: (error: Error) => void | Promise<void>): void {}
  onUnhandledRejection(_l: (reason: unknown) => void | Promise<void>): void {}
  onWarning(_l: (warning: Error) => void): void {}
}
