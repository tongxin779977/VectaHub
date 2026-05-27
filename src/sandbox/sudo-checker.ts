import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { platform } from 'node:os';
import { BWRAP_PATH, UNSHARE_PATH, SUDOERS_PATH } from './constants.js';
import type { SudoStatus, SudoConfigResult } from './types.js';

/**
 * 检查 sudo 状态
 */
export async function checkSudoStatus(): Promise<SudoStatus> {
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
      testSudo(),
      testBwrapSudo(),
      testUnshareSudo(),
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

/**
 * 测试 sudo 是否可用
 */
async function testSudo(): Promise<boolean> {
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

/**
 * 测试 bwrap 是否可以通过 sudo 无密码执行
 */
async function testBwrapSudo(): Promise<boolean> {
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

/**
 * 测试 unshare 是否可以通过 sudo 无密码执行
 */
async function testUnshareSudo(): Promise<boolean> {
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

/**
 * 配置 sudoers 文件以允许无密码执行 bwrap 和 unshare
 */
export async function setupSudoers(): Promise<SudoConfigResult> {
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
