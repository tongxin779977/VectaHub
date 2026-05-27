import { spawn } from 'node:child_process';
import { SANDBOX_EXEC_PATH, DEFAULT_PROTECTED_DIRS } from './constants.js';
import type { ExecOptions, ExecResult, IsolationStrategy, SandboxMode } from './types.js';

/**
 * 通用的进程执行器
 */
export function executeProcess(
  cmd: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    timeout: number;
    mode?: SandboxMode;
    fullCmd: string;
    namespaceUsed?: boolean;
  }
): Promise<ExecResult> {
  const startTime = Date.now();
  const mode = options.mode || 'RELAXED';

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: options.env,
      cwd: options.cwd,
      timeout: options.timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      resolve({
        success: code === 0,
        exitCode: code || 0,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        mode,
        sandboxed: true,
        command: options.fullCmd,
        namespaceUsed: options.namespaceUsed,
      });
    });

    child.on('error', (err: Error) => {
      resolve({
        success: false,
        exitCode: 1,
        stdout,
        stderr: err.message,
        duration: Date.now() - startTime,
        mode,
        sandboxed: true,
        command: options.fullCmd,
        namespaceUsed: options.namespaceUsed,
      });
    });
  });
}

/**
 * 使用 sandbox-exec 执行命令（macOS）
 */
export function executeWithSandboxExec(
  cmd: string,
  args: string[],
  options: ExecOptions,
  cwd: string,
  env: Record<string, string>,
  protectedDirs: string[] = DEFAULT_PROTECTED_DIRS
): Promise<ExecResult> {
  const fullCmd = `${cmd} ${args.join(' ')}`;
  const mode = options.mode || 'RELAXED';
  const denyRules = protectedDirs
    .map(dir => `(deny file-write* (regex "^${dir}"))`)
    .join('\n');

  const sandboxProfile = `(version 1)
(allow default)
${denyRules}
(deny mount)
(deny sysctl-write)
(allow file-write* (regex "^${cwd}/"))
(allow file-write* (regex "^${env.SANDBOX_TMP}/"))
(allow file-write* (regex "^${env.SANDBOX_WORKSPACE}/"))
`;

  const sandboxArgs = ['-f', '-', cmd, ...args];
  const child = spawn(SANDBOX_EXEC_PATH, sandboxArgs, {
    env,
    cwd,
    timeout: options.timeout,
  });

  if (child.stdin) {
    child.stdin.write(sandboxProfile);
    child.stdin.end();
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      resolve({
        success: code === 0,
        exitCode: code || 0,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        mode,
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
        mode,
        sandboxed: true,
        command: fullCmd,
        namespaceUsed: true,
      });
    });
  });
}

/**
 * 使用 unshare 执行命令（Linux）
 */
export function executeWithUnshare(
  cmd: string,
  args: string[],
  options: ExecOptions,
  cwd: string,
  env: Record<string, string>
): Promise<ExecResult> {
  const fullCmd = `${cmd} ${args.join(' ')}`;
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

  return executeProcess('unshare', unshareArgs, {
    cwd,
    env,
    timeout: options.timeout || 60000,
    mode: options.mode,
    fullCmd,
    namespaceUsed: true,
  });
}

/**
 * 使用 bubblewrap 执行命令（Linux）
 */
export function executeWithBubblewrap(
  cmd: string,
  args: string[],
  options: ExecOptions,
  cwd: string,
  env: Record<string, string>
): Promise<ExecResult> {
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

  bwrapArgs.push('--dir', cwd, '--tmpfs', cwd, cmd, ...args);

  return executeProcess('bwrap', bwrapArgs, {
    cwd,
    env,
    timeout: options.timeout || 60000,
    mode: options.mode,
    fullCmd,
    namespaceUsed: true,
  });
}

/**
 * 在当前目录中执行命令（无隔离）
 */
export function executeInDirectory(
  cmd: string,
  args: string[],
  options: ExecOptions,
  cwd: string,
  env: Record<string, string>
): Promise<ExecResult> {
  const fullCmd = `${cmd} ${args.join(' ')}`;
  return executeProcess(cmd, args, {
    cwd,
    env,
    timeout: options.timeout || 60000,
    mode: options.mode,
    fullCmd,
    namespaceUsed: false,
  });
}
