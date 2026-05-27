import type { SandboxMode, CommandDetection } from '../types/index.js';
import type { DefaultPolicy } from '../command-rules/types.js';

export type { SandboxMode };

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

export interface ExecOptions {
  mode?: SandboxMode;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  sessionId?: string;
  onConfirm?: () => Promise<boolean>;
  confirmationPrompt?: string;
  useNamespace?: boolean;
  networkIsolation?: boolean;
}

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

export type IsolationStrategy = 'sandbox-exec' | 'unshare' | 'bubblewrap' | 'directory';

export interface CommandSignature {
  signature: string;
  algorithm: string;
  timestamp: number;
}

export interface SignatureValidation {
  valid: boolean;
  message: string;
}

export interface SudoStatus {
  hasSudo: boolean;
  bwrapAllowed: boolean;
  unshareAllowed: boolean;
  message?: string;
}

export interface ExecutableVerification {
  verified: boolean;
  hash?: string;
  message: string;
}

export interface SudoConfigResult {
  success: boolean;
  message: string;
}
