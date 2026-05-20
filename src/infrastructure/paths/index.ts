import { getDefaultContext } from '../context.js';

/**
 * 获取 VectaHub 主目录路径
 * 权威来源：infrastructure environment 层
 * @returns VectaHub 主目录绝对路径
 */
export function getVectaHubHome(): string {
  return getDefaultContext().environment.getHomePath();
}

/**
 * 基于 VectaHub 主目录构建路径
 * 权威来源：infrastructure environment 层
 * @param segments 路径分段
 * @returns 完整路径
 */
export function getVectaHubPath(...segments: string[]): string {
  return getDefaultContext().environment.getPath(...segments);
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
