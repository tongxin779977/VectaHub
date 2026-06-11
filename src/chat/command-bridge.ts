import type { Command } from 'commander';
import { parse as parseShell } from 'shell-quote';
import { SimpleCache } from './utils.js';

type StreamWrite = NodeJS.WriteStream['write'];
type WriteCallback = (error?: Error | null) => void;

/**
 * 判断未知错误是否为 Commander.js 抛出的结构化错误。
 *
 * @param error - 捕获到的未知错误
 * @returns 如果错误对象包含 `code` 或 `message` 属性则返回 `true`
 */
function isCommanderError(error: unknown): error is { code?: string; message?: string } {
  return typeof error === 'object' && error !== null;
}

/** 命令缓存默认 TTL（毫秒），30 秒 */
const DEFAULT_COMMAND_CACHE_TTL_MS = 30_000;

/** 命令缓存默认容量 */
const DEFAULT_COMMAND_CACHE_MAX_SIZE = 50;

/**
 * CommandBridge 配置选项。
 */
export interface CommandBridgeOptions {
  /** 命令缓存 TTL（毫秒），默认 30000 */
  cacheTtlMs?: number;
  /** 命令缓存最大容量，默认 50 */
  cacheMaxSize?: number;
}

/**
 * Commander.js 命令桥接器。
 * 将用户输入的命令字符串委托给 Commander.js 程序执行，
 * 拦截 stdout/stderr 输出并返回结果字符串。
 *
 * 内置命令缓存机制：对短时间内重复执行的相同命令返回缓存结果，
 * 避免重复解析开销。
 *
 * @example
 * ```ts
 * const bridge = new CommandBridge(program);
 * const result = await bridge.execute('help');
 * ```
 */
export class CommandBridge {
  private program: Command;
  private cache: SimpleCache<string>;

  /**
   * 创建 CommandBridge 实例。
   *
   * @param program - Commander.js 程序实例
   * @param options - 可选的缓存配置
   */
  constructor(program: Command, options?: CommandBridgeOptions) {
    this.program = program;
    this.program.exitOverride();
    this.cache = new SimpleCache<string>(
      options?.cacheTtlMs ?? DEFAULT_COMMAND_CACHE_TTL_MS,
      options?.cacheMaxSize ?? DEFAULT_COMMAND_CACHE_MAX_SIZE,
    );
  }

  /**
   * 执行指定的 CLI 命令并返回输出文本。
   * 会拦截进程 stdout/stderr 以捕获 Commander.js 的输出。
   * 相同命令在缓存 TTL 内会直接返回缓存结果。
   *
   * @param command - 命令字符串（不含程序名前缀）
   * @returns 命令执行的输出文本
   * @throws 此方法内部捕获所有异常，不会向外抛出
   */
  async execute(command: string): Promise<string> {
    const cached = this.cache.get(command);
    if (cached !== undefined) {
      return cached;
    }

    const normalizedCommand = command.trim();
    if (!normalizedCommand) {
      return '❌ Empty command.';
    }

    const parsedArgs = parseShell(normalizedCommand);
    const stringArgs = parsedArgs.filter((arg): arg is string => typeof arg === 'string');
    if (stringArgs.length === 0) {
      return '❌ Empty command.';
    }
    const [cmdName, ...args] = stringArgs;
    const userArgs = [cmdName, ...args];

    let output = '';
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    const intercept = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback) => {
      output += typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString(typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined);
      const resolvedCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      resolvedCallback?.();
      return true;
    }) as StreamWrite;

    let result: string;
    try {
      process.stdout.write = intercept;
      process.stderr.write = intercept;

      await this.program.parseAsync(userArgs, { from: 'user' });

      result = output.trim() || `✅ Command '${cmdName}' executed (no output).`;
    } catch (error) {
      if (!isCommanderError(error)) {
        result = (output + `\n❌ Error: ${String(error)}`).trim();
      } else if (error.code === 'commander.helpDisplayed' || error.code === 'commander.help') {
        result = output.trim();
      } else if (error.code === 'commander.unknownCommand') {
        result = `❌ Unknown command: ${cmdName}. Use '/cmd help' for a list of available commands.`;
      } else {
        const errorMessage = error.message || String(error);
        result = (output + `\n❌ Error: ${errorMessage}`).trim();
      }
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    this.cache.set(command, result);
    return result;
  }

  /**
   * 清空命令缓存。
   * 当配置变更或需要强制重新执行时调用。
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * 创建 CommandBridge 实例的工厂函数。
 *
 * @param program - Commander.js 程序实例
 * @param options - 可选的缓存配置
 * @returns 新建的 `CommandBridge` 实例
 */
export function createCommandBridge(program: Command, options?: CommandBridgeOptions): CommandBridge {
  return new CommandBridge(program, options);
}
