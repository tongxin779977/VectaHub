import { homedir, tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, copyFileSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { exec, execFile, spawn } from 'node:child_process';
import type { ChildProcess, StdioOptions } from 'node:child_process';
import type { WriteStream } from 'node:fs';
import { promisify } from 'node:util';
import { parse } from 'shell-quote';
import type { IEnvironmentService } from '../interfaces/index.js';
import { Signal } from '../interfaces/environment-service.js';
import { VectaHubError, ErrorType } from '../errors/index.js';

const execAsync = promisify(exec);
const SHELL_OPERATORS = new Set(['&&', '||', '|', ';', '&', '>', '>>', '<', '2>', '2>>']);

function commandPartToText(part: string | { op: string } | { pattern: string }): string {
  if (typeof part === 'string') {
    return part;
  }
  if ('op' in part) {
    return part.op;
  }
  return String(part.pattern);
}

function splitExecutableCommand(command: string): { file: string; args: string[] } | null {
  const parsed = parse(command);
  const normalized = parsed.map(commandPartToText);
  if (normalized.length >= 4 && normalized[0] === 'node' && normalized[1] === '-e') {
    return { file: normalized[0], args: [normalized[1], normalized.slice(2).join('')] };
  }
  if (parsed.length === 0 || parsed.some(part => typeof part !== 'string' || SHELL_OPERATORS.has(part))) {
    return null;
  }

  const [file, ...args] = parsed;
  return { file: file as string, args: args as string[] };
}

function copyExecutionErrorDetails(target: Error, source: unknown): void {
  if (!source || typeof source !== 'object') {
    return;
  }
  const details = source as Record<string, unknown>;
  for (const key of ['stdout', 'stderr', 'status', 'code', 'signal', 'killed', 'cmd'] as const) {
    if (key in details) {
      (target as unknown as Record<string, unknown>)[key] = details[key];
    }
  }
}

function runExecFile(
  file: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string | undefined>; timeout?: number },
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options ?? {}, (error, stdout, stderr) => {
      const result = typeof stdout === 'object' && stdout !== null && 'stdout' in stdout
        ? stdout as { stdout?: string | Buffer; stderr?: string | Buffer }
        : { stdout, stderr };
      if (error) {
        copyExecutionErrorDetails(error, result);
        reject(error);
        return;
      }
      resolve({
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      });
    });
  });
}

/**
 * 环境服务实现
 * 统一管理环境变量和路径计算
 */
export class EnvironmentService implements IEnvironmentService {
  private readonly explicitHomePath?: string;
  private signalListeners: Map<Signal, Set<() => void | Promise<void>>>;
  private uncaughtExceptionListeners: Set<(error: Error) => void | Promise<void>>;
  private unhandledRejectionListeners: Set<(reason: unknown) => void | Promise<void>>;
  private warningListeners: Set<(warning: Error) => void>;
  private listenersAttached: boolean;

  constructor(homePath?: string) {
    this.explicitHomePath = homePath;
    this.signalListeners = new Map();
    this.uncaughtExceptionListeners = new Set();
    this.unhandledRejectionListeners = new Set();
    this.warningListeners = new Set();
    this.listenersAttached = false;
  }

  private detectHomePath(): string {
    const envPath = this.getEnv('VECTAHUB_HOME');
    if (envPath && envPath.trim() && envPath !== 'undefined' && envPath !== 'null') {
      return envPath.trim();
    }
    return join(homedir(), '.vectahub');
  }

  // ==========================================
  // 路径管理
  // ==========================================

  getHomePath(): string {
    return this.explicitHomePath ?? this.detectHomePath();
  }

  getPath(...segments: string[]): string {
    return join(this.getHomePath(), ...segments);
  }

  resolvePath(...segments: string[]): string {
    return resolve(...segments);
  }

  joinPath(...segments: string[]): string {
    return join(...segments);
  }

  getDirname(path: string): string {
    return dirname(path);
  }

  // ==========================================
  // 文件系统操作
  // ==========================================

  readFile(path: string): string {
    try {
      return readFileSync(path, 'utf-8');
    } catch (error) {
      throw new VectaHubError(
        `Failed to read file: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  async readFileAsync(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf-8');
    } catch (error) {
      throw new VectaHubError(
        `Failed to read file asynchronously: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  async *readLines(path: string): AsyncIterable<string> {
    try {
      const rl = createInterface({
        input: createReadStream(path, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        yield line;
      }
    } catch (error) {
      throw new VectaHubError(
        `Failed to read lines from file: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  writeFile(path: string, content: string): void {
    try {
      writeFileSync(path, content, 'utf-8');
    } catch (error) {
      throw new VectaHubError(
        `Failed to write file: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  exists(path: string): boolean {
    return existsSync(path);
  }

  ensureDir(path: string): void {
    try {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    } catch (error) {
      throw new VectaHubError(
        `Failed to create directory: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  async mkdirAsync(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await mkdir(path, options);
    } catch (error) {
      throw new VectaHubError(
        `Failed to create directory asynchronously: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  readDir(path: string): string[] {
    try {
      return readdirSync(path);
    } catch (error) {
      throw new VectaHubError(
        `Failed to read directory: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  readDirObjects(path: string): { name: string; isDirectory(): boolean }[] {
    try {
      return readdirSync(path, { withFileTypes: true });
    } catch (error) {
      throw new VectaHubError(
        `Failed to read directory objects: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  rm(path: string, options?: { recursive?: boolean; force?: boolean }): void {
    try {
      rmSync(path, options);
    } catch (error) {
      throw new VectaHubError(
        `Failed to remove path: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  copyFile(src: string, dest: string): void {
    try {
      copyFileSync(src, dest);
    } catch (error) {
      throw new VectaHubError(
        `Failed to copy file from ${src} to ${dest}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  createWriteStream(path: string, options?: { encoding?: BufferEncoding; flags?: string }): WriteStream {
    try {
      return createWriteStream(path, options);
    } catch (error) {
      throw new VectaHubError(
        `Failed to create write stream for file: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  stat(path: string): { size: number; isDirectory(): boolean } {
    try {
      const s = statSync(path);
      return {
        size: s.size,
        isDirectory: () => s.isDirectory(),
      };
    } catch (error) {
      throw new VectaHubError(
        `Failed to stat path: ${path}`,
        ErrorType.FILESYSTEM,
        error
      );
    }
  }

  getTmpDir(): string {
    return tmpdir();
  }

  // ==========================================
  // 环境变量管理
  // ==========================================

  getEnv(name: string, defaultValue?: string): string | undefined {
    const value = process.env[name];
    if (value === undefined || value === '') {
      return defaultValue;
    }
    return value;
  }

  setEnv(name: string, value: string): void {
    process.env[name] = value;
  }

  deleteEnv(name: string): void {
    delete process.env[name];
  }

  getEnvBoolean(name: string, defaultValue = false): boolean {
    const value = this.getEnv(name);
    if (value === undefined) {
      return defaultValue;
    }
    return value === '1' || value.toLowerCase() === 'true';
  }

  getEnvNumber(name: string, defaultValue?: number): number | undefined {
    const value = this.getEnv(name);
    if (value === undefined) {
      return defaultValue;
    }
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  getAllEnv(): Record<string, string | undefined> {
    return { ...process.env };
  }

  // ==========================================
  // 进程控制
  // ==========================================

  async exec(command: string, options?: { cwd?: string; env?: Record<string, string | undefined>; timeout?: number }): Promise<{ stdout: string; stderr: string }> {
    try {
      const executable = splitExecutableCommand(command);
      const { stdout, stderr } = executable
        ? await runExecFile(executable.file, executable.args, options)
        : await execAsync(command, options);
      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      };
    } catch (error) {
      const wrapped = new VectaHubError(
        `Failed to execute command: ${command}`,
        ErrorType.RUNTIME,
        error
      );
      copyExecutionErrorDetails(wrapped, error);
      throw wrapped;
    }
  }

  spawn(command: string, args: string[], options?: { cwd?: string; env?: Record<string, string | undefined>; stdio?: StdioOptions }): ChildProcess {
    try {
      return spawn(command, args, options ?? {});
    } catch (error) {
      throw new VectaHubError(
        `Failed to spawn process: ${command} ${args.join(' ')}`,
        ErrorType.RUNTIME,
        error
      );
    }
  }

  exit(code = 0): never {
    process.exit(code);
  }

  getArgv(): string[] {
    return [...process.argv];
  }

  getCwd(): string {
    return process.cwd();
  }

  getPlatform(): string {
    return process.platform;
  }

  // ==========================================
  // 事件监听与管理
  // ==========================================

  onSignal(signal: Signal, listener: () => void | Promise<void>): void {
    if (!this.signalListeners.has(signal)) {
      this.signalListeners.set(signal, new Set());
    }
    this.signalListeners.get(signal)!.add(listener);
    this.attachProcessListeners();
  }

  onUncaughtException(listener: (error: Error) => void | Promise<void>): void {
    this.uncaughtExceptionListeners.add(listener);
    this.attachProcessListeners();
  }

  onUnhandledRejection(listener: (reason: unknown) => void | Promise<void>): void {
    this.unhandledRejectionListeners.add(listener);
    this.attachProcessListeners();
  }

  onWarning(listener: (warning: Error) => void): void {
    this.warningListeners.add(listener);
    this.attachProcessListeners();
  }

  private attachProcessListeners(): void {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;

    for (const signal of Object.values(Signal)) {
      process.on(signal, async () => {
        const listeners = this.signalListeners.get(signal);
        if (listeners) {
          for (const listener of listeners) {
            await listener();
          }
        }
      });
    }

    process.on('uncaughtException', async (error) => {
      for (const listener of this.uncaughtExceptionListeners) {
        await listener(error);
      }
    });

    process.on('unhandledRejection', async (reason) => {
      for (const listener of this.unhandledRejectionListeners) {
        await listener(reason);
      }
    });

    process.on('warning', (warning) => {
      for (const listener of this.warningListeners) {
        listener(warning);
      }
    });
  }
}

/**
 * 创建环境服务
 * @param homePath - 可选的自定义主目录路径
 * @returns EnvironmentService 实例
 */
export function createEnvironmentService(homePath?: string): IEnvironmentService {
  return new EnvironmentService(homePath);
}
