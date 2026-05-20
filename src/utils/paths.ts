import { getDefaultContext } from '../infrastructure/context.js';

export function getVectaHubHome(): string {
  return getDefaultContext().environment.getHomePath();
}

export function getVectaHubPath(...segments: string[]): string {
  return getDefaultContext().environment.getPath(...segments);
}

export function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function getProjectQueuePath(projectRoot: string): string {
  const hash = djb2Hash(projectRoot);
  return getVectaHubPath('projects', hash, 'diagnostic-queue.json');
}
