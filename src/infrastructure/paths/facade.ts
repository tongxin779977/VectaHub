import { join } from 'node:path';
import type { IEnvironmentService } from '../interfaces/index.js';

/**
 * 路径 facade 的显式依赖契约
 */
export interface VectaHubPathDeps {
  environment: IEnvironmentService;
}

/**
 * 获取 VectaHub 主目录路径
 * 权威来源：infrastructure environment 层
 */
export function getVectaHubHomeWithDeps(deps: VectaHubPathDeps): string {
  return deps.environment.getHomePath();
}

/**
 * 基于 VectaHub 主目录构建路径
 * 权威来源：infrastructure environment 层
 */
export function getVectaHubPathWithDeps(deps: VectaHubPathDeps, ...segments: string[]): string {
  return deps.environment.getPath(...segments);
}

/**
 * 计算字符串的 djb2 哈希值（用于生成简短的唯一标识）
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
 */
export function getProjectQueuePathWithDeps(deps: VectaHubPathDeps, projectRoot: string): string {
  const hash = djb2Hash(projectRoot);
  return getVectaHubPathWithDeps(deps, 'projects', hash, 'diagnostic-queue.json');
}

/**
 * 获取全局日志目录路径
 * 用于应用日志、错误日志等跨项目共享的日志
 */
export function getGlobalLogDirWithDeps(deps: VectaHubPathDeps, ...subDirs: string[]): string {
  return getVectaHubPathWithDeps(deps, 'logs', ...subDirs);
}

/**
 * 获取项目级日志目录路径
 * 用于 trace 日志、执行记录等按项目隔离的日志
 * 路径格式: {projectRoot}/.vectahub/logs/{subDirs}
 */
export function getProjectLogDir(projectRoot: string, ...subDirs: string[]): string {
  return join(projectRoot, '.vectahub', 'logs', ...subDirs);
}

/**
 * 获取项目级执行记录目录路径
 * 路径格式: {projectRoot}/.vectahub/executions
 */
export function getProjectExecutionDir(projectRoot: string): string {
  return join(projectRoot, '.vectahub', 'executions');
}
