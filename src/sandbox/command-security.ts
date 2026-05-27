import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, accessSync, constants, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { BWRAP_PATH, UNSHARE_PATH, FALLBACK_PATH } from './constants.js';
import type { CommandSignature, SignatureValidation, ExecutableVerification } from './types.js';

/**
 * 对命令进行签名
 */
export function signCommand(command: string): CommandSignature {
  const timestamp = Date.now();
  const data = `${command}:${timestamp}`;
  const hash = createHash('sha256').update(data).digest('hex');

  return {
    signature: hash,
    algorithm: 'sha256',
    timestamp,
  };
}

/**
 * 验证命令签名
 */
export function validateCommandSignature(
  command: string,
  signatureOrObj: string | CommandSignature,
  maxAgeMs: number = 300000
): SignatureValidation {
  const currentTime = Date.now();

  if (typeof signatureOrObj === 'object') {
    const { signature, timestamp } = signatureOrObj;
    const age = currentTime - timestamp;
    if (age > maxAgeMs || age < 0) {
      return { valid: false, message: '签名已过期或时间戳无效' };
    }
    const data = `${command}:${timestamp}`;
    const expected = createHash('sha256').update(data).digest('hex');
    if (timingSafeCompare(expected, signature)) {
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
    if (timingSafeCompare(expected, signature)) {
      return { valid: true, message: `签名有效，命令生成于 ${i * 1000}ms 前` };
    }
  }

  return { valid: false, message: '签名无效或已过期' };
}

/**
 * 时序安全的字符串比较
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * 验证命令可执行文件
 */
export async function verifyCommandExecutable(
  cmd: string,
  resolvePathFn?: (cmd: string) => string | null
): Promise<ExecutableVerification> {
  const resolvedPath = (resolvePathFn || resolveCommandPath)(cmd);

  if (!resolvedPath) {
    return {
      verified: false,
      message: `无法找到命令: ${cmd}`,
    };
  }

  try {
    const hash = await computeFileHash(resolvedPath);
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

/**
 * 解析命令路径
 */
export function resolveCommandPath(cmd: string): string | null {
  const paths = (process.env.PATH || FALLBACK_PATH).split(':');

  for (const path of paths) {
    const fullPath = join(path, cmd);
    if (existsSync(fullPath) && isExecutable(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * 检查文件是否可执行
 */
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 计算文件哈希值
 */
export function computeFileHash(filePath: string): Promise<string> {
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
