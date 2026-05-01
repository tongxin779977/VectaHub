import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, accessSync, constants } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { createHash } from 'crypto';
import { createDetector } from './detector.js';
import { CommandRuleEngine, createCommandRuleEngine, loadGlobalBlocklist, loadGlobalAllowlist, loadProjectBlocklist, loadProjectAllowlist } from '../command-rules/index.js';
import type { SandboxMode, CommandDetection } from '../types/index.js';
import type { DefaultPolicy } from '../command-rules/types.js';

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
  root: join(homedir(), '.vectahub', 'sandbox'),
  workspace: join(homedir(), '.vectahub', 'sandbox', 'workspace'),
  tempDir: join(homedir(), '.vectahub', 'sandbox', 'tmp'),
  cacheDir: join(homedir(), '.vectahub', 'sandbox', 'cache'),
  mode: 'RELAXED',
  maxMemoryMB: 512,
  timeoutMs: 60000,
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL'],
  namespaceIsolation: true,
  defaultPolicy: 'passthrough', // 保持向后兼容性，使用原有行为
};

export class SandboxManager {
  private config: SandboxConfig;
  private detector = createDetector();
  private ruleEngine: CommandRuleEngine;
  private projectPath: string | undefined;

  constructor(config: Partial<SandboxConfig> & { projectPath?: string } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.projectPath = config.projectPath;
    this.ruleEngine = createCommandRuleEngine({
      globalBlocklist: loadGlobalBlocklist(),
      globalAllowlist: loadGlobalAllowlist(),
      projectBlocklist: loadProjectBlocklist(this.projectPath),
      projectAllowlist: loadProjectAllowlist(this.projectPath),
      defaultPolicy: this.config.defaultPolicy || 'passthrough',
    });
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

  private detectIsolationStrategy(): IsolationStrategy {
    const os = platform();
    
    if (os === 'darwin') {
      try {
        accessSync('/usr/bin/sandbox-exec', constants.X_OK);
        return 'sandbox-exec';
      } catch {
        return 'directory';
      }
    }
    
    if (os === 'linux') {
      try {
        accessSync('/usr/bin/bwrap', constants.X_OK);
        return 'bubblewrap';
      } catch {
        try {
          accessSync('/usr/bin/unshare', constants.X_OK);
          return 'unshare';
        } catch {
          return 'directory';
        }
      }
    }
    
    return 'directory';
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
        accessSync('/usr/bin/bwrap', constants.X_OK);
      } catch {
        resolve(false);
        return;
      }

      const child = spawn('sudo', ['-n', '/usr/bin/bwrap', '--version'], {
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
        accessSync('/usr/bin/unshare', constants.X_OK);
      } catch {
        resolve(false);
        return;
      }

      const child = spawn('sudo', ['-n', '/usr/bin/unshare', '--help'], {
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
${username} ALL=(ALL) NOPASSWD: /usr/bin/bwrap
${username} ALL=(ALL) NOPASSWD: /usr/bin/unshare
`;

    const sudoersPath = '/etc/sudoers.d/vectahub';

    return new Promise((resolve) => {
      const child = spawn('sudo', ['tee', sudoersPath], {
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
            message: `sudoers 配置已写入 ${sudoersPath}`,
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

  validateCommandSignature(command: string, signature: string, maxAgeMs: number = 300000): SignatureValidation {
    const currentTime = Date.now();
    
    for (let offset = 0; offset <= maxAgeMs; offset += 1000) {
      const timestamp = currentTime - offset;
      const data = `${command}:${timestamp}`;
      const expectedSignature = createHash('sha256').update(data).digest('hex');
      
      if (expectedSignature === signature) {
        const age = currentTime - timestamp;
        if (age <= maxAgeMs) {
          return {
            valid: true,
            message: `签名有效，命令生成于 ${age}ms 前`,
          };
        }
      }
    }
    
    return {
      valid: false,
      message: '签名无效或已过期',
    };
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
    const paths = (process.env.PATH || '/usr/bin:/bin:/usr/local/bin').split(':');
    
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

    const sandboxProfile = `(version 1)
(allow default)
(deny file-write* (regex "^/etc/"))
(deny file-write* (regex "^/usr/"))
(deny file-write* (regex "^/System/"))
(deny file-write* (regex "^/bin/"))
(deny file-write* (regex "^/sbin/"))
(deny file-write* (regex "^/Library/"))
(deny mount)
(deny sysctl-write)
(allow file-write* (regex "^${cwd}/"))
(allow file-write* (regex "^${this.config.tempDir}/"))
(allow file-write* (regex "^${this.config.workspace}/"))
`;

    const sandboxArgs = [
      '-f', '-',
      'bash',
      '-c',
      `cd "${cwd}" && "${cmd}" ${args.map(a => `'${a}'`).join(' ')}`
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

    unshareArgs.push(
      'bash',
      '-c',
      `cd "${cwd}" && "${cmd}" ${args.map(a => `'${a}'`).join(' ')}`
    );

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
      'bash',
      '-c',
      `cd "${cwd}" && "${cmd}" ${args.map(a => `'${a}'`).join(' ')}`
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

export function createSandboxManager(config?: Partial<SandboxConfig>): SandboxManager {
  return new SandboxManager(config);
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
