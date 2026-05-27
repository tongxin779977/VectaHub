import { execSync } from 'node:child_process';
import type { ICliDetector, CliDetectionResult } from '../types/provider.js';
import { createSingleton, createSilentLogger } from './utils.js';

/**
 * CLI 检测器依赖项
 */
export interface CliDetectorDeps {
  /** 自定义命令执行函数 */
  execCommand?: (command: string, timeoutMs?: number) => string;
  /** 自定义 logger */
  logger?: Pick<Console, 'warn' | 'error'>;
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
 * 用于检测命令行工具的存在、版本和帮助信息
 */
export class CliDetector implements ICliDetector {
  constructor(private readonly deps: CliDetectorDeps = {}) {}

  /**
   * 检测 CLI 工具
   * @param cliCommand CLI 命令
   * @returns 检测结果
   */
  async detect(cliCommand: string): Promise<CliDetectionResult> {
    try {
      const path = this.findCommandPath(cliCommand);
      if (!path) {
        return { found: false, error: `Command '${cliCommand}' not found in PATH` };
      }

      const versionOutput = this.deps.execCommand?.(`${cliCommand} --version`, 3000) || defaultExecCommand(`${cliCommand} --version`, 3000);
      const helpOutput = this.deps.execCommand?.(`${cliCommand} --help`, 5000) || defaultExecCommand(`${cliCommand} --help`, 5000);

      const version = this.extractVersion(versionOutput);

      return {
        found: true,
        path,
        version,
        helpOutput: helpOutput || undefined,
        versionOutput: versionOutput || undefined,
      };
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
