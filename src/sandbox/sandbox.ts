import type { SandboxMode } from '../types/index.js';
import { createDetector, type Detector } from './detector.js';

export interface Sandbox {
  mode: SandboxMode;
  isDangerous(command: string): boolean;
  shouldBlock(command: string): boolean;
  setMode(mode: SandboxMode): void;
}

export function createSandbox(mode: SandboxMode): Sandbox {
  const detector: Detector = createDetector();

  return {
    mode,
    isDangerous(command: string): boolean {
      return detector.isDangerous(command);
    },
    shouldBlock(command: string): boolean {
      if (!detector.isDangerous(command)) {
        return false;
      }
      if (this.mode === 'STRICT') {
        return true;
      }
      if (this.mode === 'RELAXED') {
        const level = detector.getDangerLevel(command);
        return level === 'critical' || level === 'high';
      }
      return false;
    },
    setMode(mode: SandboxMode): void {
      this.mode = mode;
    },
  };
}