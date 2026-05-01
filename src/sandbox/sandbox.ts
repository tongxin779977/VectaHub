import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { createDetector } from './detector.js';
import type { SandboxMode, CommandDetection } from '../types/index.js';

interface SandboxConfig {
  root: string;
  workspace: string;
  tempDir: string;
  cacheDir: string;
  mode: SandboxMode;
  maxMemoryMB: number;
  timeoutMs: number;
  allowedEnvVars: string[];
}

interface ExecOptions {
  mode?: SandboxMode;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  onConfirm?: () => Promise<boolean>;
  confirmationPrompt?: string;
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
};

export class SandboxManager {
  private config: SandboxConfig;
  private detector = createDetector();

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  setMode(mode: SandboxMode): void {
    this.config.mode = mode;
  }

  async exec(cmd: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const startTime = Date.now();
    const fullCmd = `${cmd} ${args.join(' ')}`;
    const detection = this.detector.detect(fullCmd);
    const mode = options.mode || this.config.mode;

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

    const result = this.executeInSandbox(cmd, args, options);
    result.detection = detection;
    return result;
  }

  private executeInSandbox(cmd: string, args: string[], options: ExecOptions): ExecResult {
    const startTime = Date.now();
    const cwd = options.cwd || this.config.workspace;
    const timeout = options.timeout || this.config.timeoutMs;

    const env = this.filterEnv(options.env || {});
    env.SANDBOX_ROOT = this.config.root;
    env.SANDBOX_WORKSPACE = this.config.workspace;
    env.SANDBOX_TMP = this.config.tempDir;
    env.TMPDIR = this.config.tempDir;
    env.TEMP = this.config.tempDir;

    try {
      const result = spawnSync(cmd, args, {
        cwd,
        env,
        encoding: 'utf-8',
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: result.status === 0,
        exitCode: result.status || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        duration: Date.now() - startTime,
        mode: options.mode || this.config.mode,
        sandboxed: true,
        command: `${cmd} ${args.join(' ')}`,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        duration: Date.now() - startTime,
        mode: options.mode || this.config.mode,
        sandboxed: true,
        command: `${cmd} ${args.join(' ')}`,
      };
    }
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
