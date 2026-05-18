import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 从环境变量读取可选的路径配置
 * @param name 环境变量名
 * @returns 路径字符串或 undefined
 */
function readOptionalEnvPath(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) {
    return undefined;
  }

  const value = raw.trim();
  if (!value || value === 'undefined' || value === 'null') {
    return undefined;
  }

  return value;
}

/**
 * 获取 VectaHub 主目录路径
 * @returns VectaHub 主目录绝对路径
 */
export function getVectaHubHome(): string {
  return readOptionalEnvPath('VECTAHUB_HOME') || join(homedir(), '.vectahub');
}

/**
 * 基于 VectaHub 主目录构建路径
 * @param segments 路径分段
 * @returns 完整路径
 */
export function getVectaHubPath(...segments: string[]): string {
  return join(getVectaHubHome(), ...segments);
}

/**
 * 计算字符串的 djb2 哈希值（用于生成简短的唯一标识）
 * @param input 输入字符串
 * @returns 36进制哈希字符串
 */
export function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * 获取项目诊断队列的存储路径
 * @param projectRoot 项目根目录
 * @returns 诊断队列文件绝对路径
 */
export function getProjectQueuePath(projectRoot: string): string {
  const hash = djb2Hash(projectRoot);
  return getVectaHubPath('projects', hash, 'diagnostic-queue.json');
}
