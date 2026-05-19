import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, accessSync, constants } from 'fs';
import { join } from 'path';
import { platform } from 'os';
import { getVectaHubPath } from '../utils/paths.js';
import { createHash, timingSafeEqual } from 'crypto';
import { createDetector, type Detector } from './detector.js';
import { CommandRuleEngine, createCommandRuleEngine, loadGlobalBlocklist, loadGlobalAllowlist, loadProjectBlocklist, loadProjectAllowlist } from '../command-rules/index.js';
import { SANDBOX_EXEC_PATH, BWRAP_PATH, UNSHARE_PATH, SUDOERS_PATH, FALLBACK_PATH, DEFAULT_PROTECTED_DIRS } from './constants.js';
import type { Step, SandboxMode, CommandDetection } from '../types/index.js';
import type { DefaultPolicy } from '../command-rules/types.js';
import { performEnvAudit, audit as globalAudit, AuditEventType, getCurrentSessionId, type AuditHelper } from '../infrastructure/audit/index.js';
import { createSecurityGuard } from '../security-protocol/factory.js';
import type { SecurityGuard } from '../types/security.js';

const DEFAULT_POLICY: DefaultPolicy = 'passthrough';

interface SandboxConfig {
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

interface ExecOptions {
  mode?: SandboxMode;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  onConfirm?: () => Promise<boolean>;
  confirmationPrompt?: string;
  useNamespace?: boolean;
  networkIsolation?: boolean;
}

interface ExecResult {
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

type IsolationStrategy = 'sandbox-exec' | 'unshare' | 'bubblewrap' | 'directory';

interface SudoStatus {
  hasSudo: boolean;
  bwrapAllowed: boolean;
  unshareAllowed: boolean;
  message?: string;
}

interface CommandSignature {
  signature: string;
  algorithm: string;
  timestamp: number;
}

interface SignatureValidation {
  valid: boolean;
  message: string;
}

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
  defaultPolicy: 'passthrough', // 保持向后兼容性，使用原有行为
};

/**
 * 沙箱管理器依赖注入接口
 * 用于支持自定义替换各个组件，提高可测试性
 */
export interface SandboxManagerDeps {
  detector?: Detector;
  ruleEngine?: CommandRuleEngine;
  audit?: AuditHelper;
  securityGuard?: SecurityGuard;
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

  constructor(config: Partial<SandboxConfig> & { projectPath?: string } = {}, deps: SandboxManagerDeps = {}) {
    const workspaceDefault = config.workspace || process.cwd();
    this.config = { ...DEFAULT_CONFIG, ...config, workspace: workspaceDefault };
    this.projectPath = config.projectPath;
    this.detector = deps.detector ?? createDetector();
    this.ruleEngine = deps.ruleEngine ?? createCommandRuleEngine({
      globalBlocklist: loadGlobalBlocklist(),
      globalAllowlist: loadGlobalAllowlist(),
      projectBlocklist: loadProjectBlocklist(this.projectPath),
      projectAllowlist: loadProjectAllowlist(this.projectPath),
      defaultPolicy: this.config.defaultPolicy || 'passthrough',
    });
    this.auditHelper = deps.audit ?? globalAudit;
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

  private async detectCapabilities(): Promise<void> {
    if (this.capabilities) return;

    const auditResult = await performEnvAudit();
    const os = auditResult.platform;
    
    this.auditHelper.log({
      event: AuditEventType.ENV_AUDIT,
      timestamp: new Date().toISOString(),
      sessionId: getCurrentSessionId(),
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

    if (os === 'darwin') {
      try {
        accessSync(SANDBOX_EXEC_PATH, constants.X_OK);
        caps.hasSandboxExec = true;
      } catch {
        caps.hasSandboxExec = false;
      }
    } else if (os === 'linux') {
      // Test bwrap
      caps.hasBwrap = await this.testExecutable(BWRAP_PATH, ['--version']);
      
      // Test unshare
      caps.hasUnshare = await this.testExecutable(UNSHARE_PATH, ['--version']).catch(() => 
        this.testExecutable(UNSHARE_PATH, ['--help']) // fallback for older versions
      );
    }

    this.capabilities = caps;
    this.isolationStrategy = this.computeStrategy();

    this.auditHelper.log({
      event: AuditEventType.CONFIG_CHANGE,
      timestamp: new Date().toISOString(),
      sessionId: getCurrentSessionId(),
      module: 'Sandbox',
      action: 'strategy_selected',
      input: { caps: this.capabilities },
      output: { strategy: this.isolationStrategy },
      success: true,
    });
  }

  private async testExecutable(path: string, args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        accessSync(path, constants.X_OK);
      } catch {
        return resolve(false);
      }

      const child = spawn(path, args, { timeout: 2000 });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
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
    const os = platform();
    const status: SudoStatus = {
      hasSudo: false,
      bwrapAllowed: false,
      unshareAllowed: false,
    };

    if (os === 'darwin') {
      status.hasSudo = true;
      status.message = 'macOS sandbox-exec 不需要 sudo 权限';
      return status;
    }

    if (os === 'linux') {
      const [hasSudo, bwrapAllowed, unshareAllowed] = await Promise.all([
        this.testSudo(),
        this.testBwrapSudo(),
        this.testUnshareSudo(),
      ]);

      status.hasSudo = hasSudo;
      status.bwrapAllowed = bwrapAllowed;
      status.unshareAllowed = unshareAllowed;

      if (bwrapAllowed) {
        status.message = 'bubblewrap 可以无密码执行';
      } else if (unshareAllowed) {
        status.message = 'unshare 可以无密码执行';
      } else if (hasSudo) {
        status.message = 'sudo 可用，但 bwrap/unshare 需要密码';
      } else {
        status.message = 'sudo 不可用，将使用目录隔离模式';
      }

      return status;
    }

    status.message = '未知平台，使用目录隔离模式';
    return status;
  }

  private async testSudo(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('sudo', ['-n', 'true'], {
        timeout: 5000,
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  private async testBwrapSudo(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        accessSync(BWRAP_PATH, constants.X_OK);
      } catch {
        resolve(false);
        return;
      }

      const child = spawn('sudo', ['-n', BWRAP_PATH, '--version'], {
        timeout: 5000,
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  private async testUnshareSudo(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        accessSync(UNSHARE_PATH, constants.X_OK);
      } catch {
        resolve(false);
        return;
      }

      const child = spawn('sudo', ['-n', UNSHARE_PATH, '--help'], {
        timeout: 5000,
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  async setupSudoers(): Promise<{ success: boolean; message: string }> {
    const os = platform();

    if (os === 'darwin') {
      return {
        success: true,
        message: 'macOS sandbox-exec 不需要 sudo 配置',
      };
    }

    if (os !== 'linux') {
      return {
        success: false,
        message: '仅支持 Linux 平台的 sudo 配置',
      };
    }

    const username = process.env.USER || 'unknown';
    const sudoersContent = `# VectaHub sudoers configuration
# Allow ${username} to run bwrap and unshare without password
${username} ALL=(ALL) NOPASSWD: ${BWRAP_PATH}
${username} ALL=(ALL) NOPASSWD: ${UNSHARE_PATH}
`;

    return new Promise((resolve) => {
      const child = spawn('sudo', ['tee', SUDOERS_PATH], {
        timeout: 10000,
      });

      let stderr = '';

      child.stdin?.write(sudoersContent);
      child.stdin?.end();

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({
            success: true,
            message: `sudoers 配置已写入 ${SUDOERS_PATH}`,
          });
        } else {
          resolve({
            success: false,
            message: `配置失败: ${stderr || '未知错误'}`,
          });
        }
      });

      child.on('error', (err: Error) => {
        resolve({
          success: false,
          message: `配置失败: ${err.message}`,
        });
      });
    });
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
    const timestamp = Date.now();
    const data = `${command}:${timestamp}`;
    const hash = createHash('sha256').update(data).digest('hex');
    
    return {
      signature: hash,
      algorithm: 'sha256',
      timestamp,
    };
  }

  validateCommandSignature(command: string, signatureOrObj: string | CommandSignature, maxAgeMs: number = 300000): SignatureValidation {
    const currentTime = Date.now();

    if (typeof signatureOrObj === 'object') {
      const { signature, timestamp } = signatureOrObj;
      const age = currentTime - timestamp;
      if (age > maxAgeMs || age < 0) {
        return { valid: false, message: '签名已过期或时间戳无效' };
      }
      const data = `${command}:${timestamp}`;
      const expected = createHash('sha256').update(data).digest('hex');
      if (this.timingSafeCompare(expected, signature)) {
        return { valid: true, message: `签名有效，命令生成于 ${age}ms 前` };
      }
      return { valid: false, message: '签名不匹配' };
    }

    const signature = signatureOrObj;
    const maxIterations = Math.min(maxAgeMs / 1000, 60);
    for (let i = 0; i <= maxIterations; i++) {
      const timestamp = currentTime - i * 1000;
      const data = `${command}:${timestamp}`;
      const expected = createHash('sha256').update(data).digest('hex');
      if (this.timingSafeCompare(expected, signature)) {
        return { valid: true, message: `签名有效，命令生成于 ${i * 1000}ms 前` };
      }
    }

    return { valid: false, message: '签名无效或已过期' };
  }

  private timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  async verifyCommandExecutable(cmd: string): Promise<{ verified: boolean; hash?: string; message: string }> {
    const resolvedPath = this.resolveCommandPath(cmd);
    
    if (!resolvedPath) {
      return {
        verified: false,
        message: `无法找到命令: ${cmd}`,
      };
    }

    try {
      const hash = await this.computeFileHash(resolvedPath);
      return {
        verified: true,
        hash,
        message: `命令 ${cmd} 验证通过，哈希值: ${hash}`,
      };
    } catch (err) {
      return {
        verified: false,
        message: `验证失败: ${(err as Error).message}`,
      };
    }
  }

  private resolveCommandPath(cmd: string): string | null {
    const paths = (process.env.PATH || FALLBACK_PATH).split(':');
    
    for (const path of paths) {
      const fullPath = join(path, cmd);
      if (existsSync(fullPath) && this.isExecutable(fullPath)) {
        return fullPath;
      }
    }
    
    return null;
  }

  private isExecutable(path: string): boolean {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async computeFileHash(filePath: string): Promise<string> {
    const { createReadStream } = await import('fs');
    
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  private async execWithSandboxExec(cmd: string, args: string[], options: ExecOptions, cwd: string, env: Record<string, string>): Promise<ExecResult> {
    const startTime = Date.now();
    const fullCmd = `${cmd} ${args.join(' ')}`;

    const protectedDirs = this.config.protectedDirs ?? DEFAULT_PROTECTED_DIRS;
    const denyRules = protectedDirs
      .map(dir => `(deny file-write* (regex "^${dir}"))`)
      .join('\n');

    const sandboxProfile = `(version 1)
(allow default)
${denyRules}
(deny mount)
(deny sysctl-write)
(allow file-write* (regex "^${cwd}/"))
(allow file-write* (regex "^${this.config.tempDir}/"))
(allow file-write* (regex "^${this.config.workspace}/"))
`;

    const sandboxArgs = [
      '-f', '-',
      cmd,
      ...args
    ];

    return new Promise((resolve) => {
      const child = spawn('sandbox-exec', sandboxArgs, {
        env,
        cwd,
        timeout: options.timeout || this.config.timeoutMs,
      });

      if (child.stdin) {
        child.stdin.write(sandboxProfile);
        child.stdin.end();
      }

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: true,
        });
      });

      child.on('error', (err: Error) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: err.message,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: true,
        });
      });
    });
  }

  private async execWithUnshare(cmd: string, args: string[], options: ExecOptions, cwd: string, env: Record<string, string>): Promise<ExecResult> {
    const startTime = Date.now();
    const fullCmd = `${cmd} ${args.join(' ')}`;

    const unshareCmd = 'unshare';
    const unshareArgs = [
      '--user',
      '--map-root-user',
      '--mount',
      '--pid',
      '--fork',
      '--kill-sigstop',
    ];

    if (options.networkIsolation) {
      unshareArgs.push('--net');
    }

    unshareArgs.push(cmd, ...args);

    return new Promise((resolve) => {
      const child = spawn(unshareCmd, unshareArgs, {
        env,
        cwd,
        timeout: options.timeout || this.config.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: true,
        });
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: err.message,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: true,
        });
      });
    });
  }

  private async execWithBubblewrap(cmd: string, args: string[], options: ExecOptions, cwd: string, env: Record<string, string>): Promise<ExecResult> {
    const startTime = Date.now();
    const fullCmd = `${cmd} ${args.join(' ')}`;

    const bwrapArgs = [
      '--unshare-user',
      '--map-root-user',
      '--mount-proc',
    ];

    if (options.networkIsolation) {
      bwrapArgs.push('--unshare-net');
    } else {
      bwrapArgs.push('--share-net');
    }

    bwrapArgs.push(
      '--dir', cwd,
      '--tmpfs', cwd,
      cmd,
      ...args
    );

    return new Promise((resolve) => {
      const child = spawn('bwrap', bwrapArgs, {
        env,
        cwd,
        timeout: options.timeout || this.config.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: true,
        });
      });

      child.on('error', (err: Error) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: err.message,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: true,
        });
      });
    });
  }

  private async execInDirectory(cmd: string, args: string[], options: ExecOptions, cwd: string, env: Record<string, string>): Promise<ExecResult> {
    const startTime = Date.now();
    const fullCmd = `${cmd} ${args.join(' ')}`;

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        env,
        cwd,
        timeout: options.timeout || this.config.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: false,
        });
      });

      child.on('error', (err: Error) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: err.message,
          duration: Date.now() - startTime,
          mode: options.mode || this.config.mode,
          sandboxed: true,
          command: fullCmd,
          namespaceUsed: false,
        });
      });
    });
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

    await this.detectCapabilities();

    if (options.useNamespace !== false && this.config.namespaceIsolation) {
      const strategy = this.detectIsolationStrategy();
      
      switch (strategy) {
        case 'sandbox-exec':
          return this.execWithSandboxExec(cmd, args, options, cwd, env);
        case 'bubblewrap':
          return this.execWithBubblewrap(cmd, args, options, cwd, env);
        case 'unshare':
          return this.execWithUnshare(cmd, args, options, cwd, env);
        case 'directory':
          return this.execInDirectory(cmd, args, options, cwd, env);
      }
    }

    return this.execInDirectory(cmd, args, options, cwd, env);
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
}

export function createSandboxManager(
  config?: Partial<SandboxConfig>,
  deps?: SandboxManagerDeps
): SandboxManager {
  return new SandboxManager(config, deps);
}

export interface Sandbox {
  mode: SandboxMode;
  shouldBlock(command: string): boolean;
  isDangerous(command: string): boolean;
  setMode(mode: SandboxMode): void;
}

export function createSandbox(mode: SandboxMode = 'RELAXED'): Sandbox {
  const manager = createSandboxManager({ mode });
  
  return {
    get mode() {
      return manager.getConfig().mode;
    },
    
    shouldBlock(command: string): boolean {
      const detection = manager['detector'].detect(command);
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
          return false;
      }
    },
    
    isDangerous(command: string): boolean {
      return manager['detector'].isDangerous(command);
    },
    
    setMode(mode: SandboxMode): void {
      manager.setMode(mode);
    },
  };
}
