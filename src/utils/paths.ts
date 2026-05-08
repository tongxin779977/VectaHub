import { homedir } from 'node:os';
import { join } from 'node:path';

export function getVectaHubHome(): string {
  return process.env.VECTAHUB_HOME || join(homedir(), '.vectahub');
}

export function getVectaHubPath(...segments: string[]): string {
  return join(getVectaHubHome(), ...segments);
}
