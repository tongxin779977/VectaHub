import { execSync } from 'node:child_process';
import type { ICliDetector, CliDetectionResult } from '../types/provider.js';
import { createSingleton, createSilentLogger } from './utils.js';

/**
 * CLI 检测器缓存条目
 */
interface CacheEntry {
  /** 缓存的检测结果 */
  result: CliDetectionResult;
  /** 缓存创建时间戳（毫秒） */
  timestamp: number;
}

/**
 * CLI 检测器依赖项
 */
export interface CliDetectorDeps {
  /** 自定义命令执行函数 */
  execCommand?: (command: string, timeoutMs?: number) => string;
  /** 自定义 logger */
  logger?: Pick<Console, 'warn' | 'error'>;
  /** 缓存过期时间（毫秒），默认 300000（5 分钟），设为 0 则禁用缓存 */
  cacheTtlMs?: number;
}

/**
 * 默认命令执行函数
 */
const defaultExecCommand = (command: string, timeoutMs = 5000): string => {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: timeoutMs }).trim();
  } catch {
    return '';
  }
};

/**
 * CLI 检测器实现类
 * 用于检测命令行工具的存在、版本和帮助信息，支持结果缓存
 */
export class CliDetector implements ICliDetector {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs: number;

  constructor(private readonly deps: CliDetectorDeps = {}) {
    this.cacheTtlMs = deps.cacheTtlMs ?? 300000;
  }

  /**
   * 检测 CLI 工具，结果会被缓存以避免重复执行外部命令
   * @param cliCommand CLI 命令
   * @returns 检测结果
   */
  async detect(cliCommand: string): Promise<CliDetectionResult> {
    const cached = this.getFromCache(cliCommand);
    if (cached) {
      return cached;
    }

    try {
      const path = this.findCommandPath(cliCommand);
      if (!path) {
        const result: CliDetectionResult = { found: false, error: `Command '${cliCommand}' not found in PATH` };
        this.putToCache(cliCommand, result);
        return result;
      }

      const versionOutput = this.deps.execCommand?.(`${cliCommand} --version`, 3000) || defaultExecCommand(`${cliCommand} --version`, 3000);
      const helpOutput = this.deps.execCommand?.(`${cliCommand} --help`, 5000) || defaultExecCommand(`${cliCommand} --help`, 5000);

      const version = this.extractVersion(versionOutput);

      const result: CliDetectionResult = {
        found: true,
        path,
        version,
        helpOutput: helpOutput || undefined,
        versionOutput: versionOutput || undefined,
      };

      this.putToCache(cliCommand, result);
      return result;
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 清除检测缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 从缓存获取检测结果
   * @param cliCommand CLI 命令
   * @returns 缓存的检测结果，缓存未命中或已过期时返回 null
   */
  private getFromCache(cliCommand: string): CliDetectionResult | null {
    if (this.cacheTtlMs <= 0) return null;

    const entry = this.cache.get(cliCommand);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(cliCommand);
      return null;
    }

    return entry.result;
  }

  /**
   * 将检测结果放入缓存
   * @param cliCommand CLI 命令
   * @param result 检测结果
   */
  private putToCache(cliCommand: string, result: CliDetectionResult): void {
    if (this.cacheTtlMs <= 0) return;
    this.cache.set(cliCommand, { result, timestamp: Date.now() });
  }

  /**
   * 查找命令路径
   * @param command 命令名
   * @returns 命令路径或 null
   */
  private findCommandPath(command: string): string | null {
    try {
      const isWindows = process.platform === 'win32';
      const whichCmd = isWindows ? 'where' : 'which';
      const result = this.deps.execCommand?.(`${whichCmd} ${command}`, 3000) || defaultExecCommand(`${whichCmd} ${command}`, 3000);
      return result || null;
    } catch {
      return null;
    }
  }

  /**
   * 从输出中提取版本信息
   * @param output 命令输出
   * @returns 版本字符串或 undefined
   */
  private extractVersion(output: string): string | undefined {
    if (!output) return undefined;

    const versionPatterns = [
      /version\s+([\d]+\.[\d]+\.[\d]+[^\s]*)/i,
      /v([\d]+\.[\d]+\.[\d]+[^\s]*)/,
      /([\d]+\.[\d]+\.[\d]+[^\s]*)/,
    ];

    for (const pattern of versionPatterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return output.split('\n')[0]?.trim() || undefined;
  }
}

/**
 * 获取 CLI Detector 单例实例
 * @param deps 依赖项
 * @returns CLI Detector 实例
 */
const { getInstance: getCliDetector, reset: resetCliDetector } = createSingleton<
  ICliDetector,
  CliDetectorDeps
>((deps) => new CliDetector({ logger: createSilentLogger(), ...deps }));

export { getCliDetector, resetCliDetector };
