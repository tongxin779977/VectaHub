import { existsSync, mkdirSync, rmSync, writeFileSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';

import { getVectaHubPath } from '../infrastructure/paths/index.js';
import { createDetector, type Detector } from './detector.js';
import { CommandRuleEngine, createCommandRuleEngine } from '../command-rules/index.js';
import {
  loadGlobalBlocklist,
  loadGlobalAllowlist,
  loadProjectBlocklist,
  loadProjectAllowlist,
} from '../command-rules/loader.js';
import { DEFAULT_PROTECTED_DIRS } from './constants.js';
import type { SandboxMode, CommandDetection } from '../types/index.js';
import type { DefaultPolicy } from '../command-rules/types.js';
import { performEnvAudit, AuditEventType, createNoopAuditHelper, type AuditHelper } from '../infrastructure/audit/index.js';
import { createSecurityGuard } from '../security-protocol/factory.js';
import type { SecurityGuard } from '../types/security.js';
import {
  executeWithSandboxExec,
  executeWithUnshare,
  executeWithBubblewrap,
  executeInDirectory,
} from './isolation-strategies.js';
import {
  signCommand,
  validateCommandSignature,
  verifyCommandExecutable,
  resolveCommandPath,
} from './command-security.js';
import {
  checkSudoStatus,
  setupSudoers,
} from './sudo-checker.js';
import type {
  SandboxConfig,
  ExecOptions,
  ExecResult,
  IsolationStrategy,
  CommandSignature,
  SignatureValidation,
  SudoStatus,
  ExecutableVerification,
  SudoConfigResult,
} from './types.js';

// Re-export all shared types
export type {
  SandboxConfig,
  ExecOptions,
  ExecResult,
  IsolationStrategy,
  CommandSignature,
  SignatureValidation,
  SudoStatus,
  ExecutableVerification,
  SudoConfigResult,
} from './types.js';

/**
 * SandboxManager 内部运行时默认配置。
 *
 * 注意：此配置与 ConfigService 中的用户持久化配置 (STRICT/block) 是不同层面：
 * - ConfigService (infrastructure/config/service.ts)：用户面向的持久化默认值，用于 config.yaml
 * - 本配置：SandboxManager 实例化时的内部运行时默认值
 *
 * 当前 SandboxManager 不从 ConfigService 读取配置，调用方需显式传入所需配置。
 * defaultPolicy: 'passthrough' 是有意设计——当命令未命中黑白名单时，
 * 交给后续的危险命令检测系统 (detector) 处理，而非直接拒绝。
 * CommandRuleEvaluator (security-protocol) 也独立使用 'passthrough' 以保证安全评估管线完整性。
 */
const DEFAULT_CONFIG: SandboxConfig = {
  root: getVectaHubPath('sandbox'),
  workspace: getVectaHubPath('sandbox', 'workspace'),
  tempDir: getVectaHubPath('sandbox', 'tmp'),
  cacheDir: getVectaHubPath('sandbox', 'cache'),
  mode: 'RELAXED',
  maxMemoryMB: 512,
  timeoutMs: 60000,
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL'],
  namespaceIsolation: true,
  defaultPolicy: 'passthrough',
};

/**
 * 沙箱管理器依赖注入接口
 * 用于支持自定义替换各个组件，提高可测试性
 */
export interface SandboxManagerDeps {
  detector?: Detector;
  ruleEngine?: CommandRuleEngine;
  audit: AuditHelper;
  securityGuard?: SecurityGuard;
  commandRuleLoader?: {
    logger: { error: (context: { error: unknown }, message: string) => void };
    getGlobalConfigPath: () => string;
  };
}

export class SandboxManager {
  private config: SandboxConfig;
  private detector: Detector;
  private ruleEngine: CommandRuleEngine;
  private auditHelper: AuditHelper;
  private securityGuard: SecurityGuard;
  private projectPath: string | undefined;

  private isolationStrategy: IsolationStrategy | null = null;
  private capabilities: {
    hasBwrap: boolean;
    hasUnshare: boolean;
    hasSandboxExec: boolean;
    hasUserNS: boolean;
  } | null = null;

  constructor(config: Partial<SandboxConfig> & { projectPath?: string } = {}, deps: SandboxManagerDeps) {
    const workspaceDefault = config.workspace || process.cwd();
    this.config = { ...DEFAULT_CONFIG, ...config, workspace: workspaceDefault };
    this.projectPath = config.projectPath;
    this.detector = deps.detector ?? createDetector();
    const commandRuleLoader = deps.commandRuleLoader ?? {
      logger: console,
      getGlobalConfigPath: () => getVectaHubPath('command-rules'),
    };
    this.ruleEngine = deps.ruleEngine ?? createCommandRuleEngine({
      globalBlocklist: loadGlobalBlocklist(commandRuleLoader),
      globalAllowlist: loadGlobalAllowlist(commandRuleLoader),
      projectBlocklist: loadProjectBlocklist(this.projectPath, commandRuleLoader),
      projectAllowlist: loadProjectAllowlist(this.projectPath, commandRuleLoader),
      defaultPolicy: this.config.defaultPolicy || 'passthrough',
    });
    this.auditHelper = deps.audit;
    this.securityGuard = deps.securityGuard ?? createSecurityGuard();
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [
      this.config.root,
      this.config.workspace,
      this.config.tempDir,
      this.config.cacheDir,
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private async detectCapabilities(sessionId = 'unknown'): Promise<void> {
    if (this.capabilities) return;

    const auditResult = await performEnvAudit();
    const os = auditResult.platform;
    
    this.auditHelper.log({
      event: AuditEventType.ENV_AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Sandbox',
      action: 'detect_capabilities',
      output: auditResult,
      success: true,
    });

    const caps = {
      hasBwrap: false,
      hasUnshare: false,
      hasSandboxExec: false,
      hasUserNS: auditResult.linuxKernel.userNamespaces,
    };

    this.capabilities = caps;
    this.isolationStrategy = this.computeStrategy();

    this.auditHelper.log({
      event: AuditEventType.CONFIG_CHANGE,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Sandbox',
      action: 'strategy_selected',
      input: { caps: this.capabilities },
      output: { strategy: this.isolationStrategy },
      success: true,
    });
  }

  private computeStrategy(): IsolationStrategy {
    const os = platform();
    if (os === 'darwin' && this.capabilities?.hasSandboxExec) return 'sandbox-exec';
    if (os === 'linux') {
      if (this.capabilities?.hasBwrap) return 'bubblewrap';
      if (this.capabilities?.hasUnshare && this.capabilities?.hasUserNS) return 'unshare';
    }
    return 'directory';
  }

  private detectIsolationStrategy(): IsolationStrategy {
    return this.isolationStrategy || this.computeStrategy();
  }

  async checkSudoStatus(): Promise<SudoStatus> {
    return checkSudoStatus();
  }

  async setupSudoers(): Promise<{ success: boolean; message: string }> {
    return setupSudoers();
  }

  getStatusSummary(): Promise<{
    platform: string;
    isolationStrategy: IsolationStrategy;
    sudoStatus: SudoStatus;
  }> {
    return this.checkSudoStatus().then((sudoStatus) => ({
      platform: platform(),
      isolationStrategy: this.detectIsolationStrategy(),
      sudoStatus,
    }));
  }

  signCommand(command: string): CommandSignature {
    return signCommand(command);
  }

  validateCommandSignature(command: string, signatureOrObj: string | CommandSignature, maxAgeMs: number = 300000): SignatureValidation {
    return validateCommandSignature(command, signatureOrObj, maxAgeMs);
  }

  async verifyCommandExecutable(cmd: string): Promise<ExecutableVerification> {
    return verifyCommandExecutable(cmd, resolveCommandPath);
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  setMode(mode: SandboxMode): void {
    this.config.mode = mode;
  }

  async exec(cmd: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const startTime = Date.now();
    const fullCmd = `${cmd} ${args.join(' ')}`;
    const mode = options.mode || this.config.mode;

    const ruleResult = this.ruleEngine.evaluate(fullCmd);

    if (ruleResult.matched && ruleResult.decision === 'block') {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: ruleResult.message,
        duration: Date.now() - startTime,
        mode,
        sandboxed: true,
        command: fullCmd,
      };
    }

    if (ruleResult.matched && ruleResult.decision === 'allow') {
      const result = await this.executeInSandbox(cmd, args, options);
      return result;
    }

    const detection = this.detector.detect(fullCmd);

    if (detection.isDangerous) {
      switch (mode) {
        case 'STRICT':
        case 'RELAXED':
          return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: `Dangerous command blocked (${detection.level}): ${detection.reason}`,
            duration: Date.now() - startTime,
            mode,
            sandboxed: true,
            command: fullCmd,
            detection,
          };
        case 'CONSENSUS':
          if (options.onConfirm) {
            const confirmed = await options.onConfirm();
            if (!confirmed) {
              return {
                success: false,
                exitCode: 1,
                stdout: '',
                stderr: 'Command execution cancelled by user',
                duration: Date.now() - startTime,
                mode,
                sandboxed: true,
                command: fullCmd,
                detection,
              };
            }
          } else {
            return {
              success: false,
              exitCode: 1,
              stdout: '',
              stderr: `Dangerous command requires confirmation (${detection.level}): ${detection.reason}`,
              duration: Date.now() - startTime,
              mode,
              sandboxed: true,
              command: fullCmd,
              detection,
            };
          }
          break;
      }
    }

    const result = await this.executeInSandbox(cmd, args, options);
    result.detection = detection;
    return result;
  }

  private async executeInSandbox(cmd: string, args: string[], options: ExecOptions): Promise<ExecResult> {
    const cwd = options.cwd || this.config.workspace;
    const env = this.filterEnv(options.env || {});
    env.SANDBOX_ROOT = this.config.root;
    env.SANDBOX_WORKSPACE = this.config.workspace;
    env.SANDBOX_TMP = this.config.tempDir;
    env.TMPDIR = this.config.tempDir;
    env.TEMP = this.config.tempDir;

    await this.detectCapabilities(options.sessionId);

    if (options.useNamespace !== false && this.config.namespaceIsolation) {
      const strategy = this.detectIsolationStrategy();
      
      switch (strategy) {
        case 'sandbox-exec':
          return executeWithSandboxExec(cmd, args, options, cwd, env, this.config.protectedDirs);
        case 'bubblewrap':
          return executeWithBubblewrap(cmd, args, options, cwd, env);
        case 'unshare':
          return executeWithUnshare(cmd, args, options, cwd, env);
        case 'directory':
          return executeInDirectory(cmd, args, options, cwd, env);
      }
    }

    return executeInDirectory(cmd, args, options, cwd, env);
  }

  private filterEnv(userEnv: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of this.config.allowedEnvVars) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }
    for (const [key, value] of Object.entries(userEnv)) {
      env[key] = value;
    }
    return env;
  }

  writeFile(path: string, content: string): void {
    const fullPath = join(this.config.workspace, path);
    writeFileSync(fullPath, content, 'utf-8');
  }

  cleanup(): void {
    if (existsSync(this.config.tempDir)) {
      rmSync(this.config.tempDir, { recursive: true, force: true });
      mkdirSync(this.config.tempDir, { recursive: true });
    }
  }

  getWorkspacePath(): string {
    return this.config.workspace;
  }

  getIsolationStrategy(): IsolationStrategy {
    return this.detectIsolationStrategy();
  }

  /**
   * 检测命令是否危险
   */
  detect(command: string): ReturnType<Detector['detect']> {
    return this.detector.detect(command);
  }

  /**
   * 判断命令是否危险
   */
  isDangerous(command: string): ReturnType<Detector['isDangerous']> {
    return this.detector.isDangerous(command);
  }
}

/**
 * 创建沙箱管理器实例
 *
 * SandboxManager 是沙箱模块的核心类，负责命令安全检测、
 * 隔离策略选择、命令签名验证和沙箱化执行。
 *
 * @param config - 部分配置（与默认配置合并）
 * @param deps - 依赖注入（audit 为必选）
 * @returns SandboxManager 实例
 */
export function createSandboxManager(
  config: Partial<SandboxConfig> | undefined,
  deps: SandboxManagerDeps
): SandboxManager {
  return new SandboxManager(config, deps);
}

export interface Sandbox {
  mode: SandboxMode;
  shouldBlock(command: string): boolean;
  isDangerous(command: string): boolean;
  setMode(mode: SandboxMode): void;
}

/**
 * 创建简易沙箱实例
 *
 * 提供轻量级的沙箱接口，内部使用 SandboxManager 进行命令危险性检测。
 * 适用于不需要完整命令执行能力、仅需命令安全判断的场景。
 *
 * @param mode - 沙箱模式，默认 'RELAXED'
 * @returns 沙箱实例，包含 shouldBlock、isDangerous、setMode 方法
 */
export function createSandbox(mode: SandboxMode = 'RELAXED'): Sandbox {
  const manager = createSandboxManager({ mode }, { audit: createNoopAuditHelper() });
  
  return {
    get mode() {
      return manager.getConfig().mode;
    },
    
    shouldBlock(command: string): boolean {
      const detection = manager.detect(command);
      const currentMode = manager.getConfig().mode;
      
      if (!detection.isDangerous) {
        return false;
      }
      
      switch (currentMode) {
        case 'STRICT':
          return true;
        case 'RELAXED':
          return detection.level === 'critical' || detection.level === 'high';
        case 'CONSENSUS':
        default:
          return false;
      }
    },
    
    isDangerous(command: string): boolean {
      return manager.isDangerous(command);
    },
    
    setMode(mode: SandboxMode): void {
      manager.setMode(mode);
    },
  };
}
