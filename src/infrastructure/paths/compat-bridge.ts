import { getDefaultContext } from '../context.js';
import {
  getProjectQueuePathWithDeps,
  getVectaHubHomeWithDeps,
  getVectaHubPathWithDeps,
  type VectaHubPathDeps,
} from './facade.js';

function createPathBridgeDeps(): VectaHubPathDeps {
  const context = getDefaultContext();
  return {
    environment: context.environment,
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用 getVectaHubHomeWithDeps(deps)
 */
export function getVectaHubHome(): string {
  return getVectaHubHomeWithDeps(createPathBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史路径 API。
 * @deprecated 建议使用 getVectaHubPathWithDeps(deps, ...segments)
 */
export function getVectaHubPath(...segments: string[]): string {
  return getVectaHubPathWithDeps(createPathBridgeDeps(), ...segments);
}

/**
 * 兼容桥接层：默认 context 仅用于历史路径 API。
 * @deprecated 建议使用 getProjectQueuePathWithDeps(deps, projectRoot)
 */
export function getProjectQueuePath(projectRoot: string): string {
  return getProjectQueuePathWithDeps(createPathBridgeDeps(), projectRoot);
}
