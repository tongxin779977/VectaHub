/**
 * Sandbox 模块接口定义
 * 遵循 Interface-first 原则，不包含实现代码
 */

import type { SandboxMode, CommandDetection, DangerCategory } from '../types/index.js';
import type { DefaultPolicy } from '../command-rules/types.js';

/**
 * 沙箱配置接口
 */
export interface SandboxConfig {
  root: string;
  workspace: string;
  tempDir: string;
  cacheDir: string;
  mode: SandboxMode;
  maxMemoryMB: number;
  timeoutMs: number;
  allowedEnvVars: string[];
  namespaceIsolation: boolean;
  defaultPolicy?: DefaultPolicy;
  protectedDirs?: string[];
}

/**
 * 执行选项接口
 */
export interface ExecOptions {
  mode?: SandboxMode;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  onConfirm?: () => Promise<boolean>;
  confirmationPrompt?: string;
  useNamespace?: boolean;
  networkIsolation?: boolean;
}

/**
 * 执行结果接口
 */
export interface ExecResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  mode: SandboxMode;
  sandboxed: boolean;
  command: string;
  detection?: CommandDetection;
  namespaceUsed?: boolean;
}

/**
 * 威胁类型
 */
export type ThreatType = 'injection' | 'semantic_command';

/**
 * 语义检测结果接口
 */
export interface SemanticDetectionResult {
  detected: boolean;
  threatType: ThreatType | 'none';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  reason?: string;
  matchedPattern?: string;
}

/**
 * 沙箱管理器接口
 */
export interface ISandboxManager {
  exec(command: string, args?: string[], options?: ExecOptions): Promise<ExecResult>;
  detect(command: string): CommandDetection;
  isSafe(command: string): boolean;
  getConfig(): SandboxConfig;
  updateConfig(config: Partial<SandboxConfig>): void;
}

/**
 * 命令检测器接口
 */
export interface IDetector {
  detect(command: string, cliTool?: string): CommandDetection;
  isDangerous(command: string, cliTool?: string): boolean;
  getDangerLevel(command: string, cliTool?: string): {
    level: 'critical' | 'high' | 'medium' | 'low' | 'none';
    matchedPattern?: RegExp;
  };
}

/**
 * 语义检测器接口
 */
export interface ISemanticDetector {
  detectInjection(input: string): SemanticDetectionResult;
  detectDangerousCommand(command: string): SemanticDetectionResult;
  scan(input: string, command?: string): SemanticDetectionResult;
  toCommandDetection(result: SemanticDetectionResult): CommandDetection;
}
