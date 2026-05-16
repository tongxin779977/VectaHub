import { homedir } from 'node:os';
import { join } from 'node:path';

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

export function getVectaHubHome(): string {
  return readOptionalEnvPath('VECTAHUB_HOME') || join(homedir(), '.vectahub');
}

export function getVectaHubPath(...segments: string[]): string {
  return join(getVectaHubHome(), ...segments);
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
