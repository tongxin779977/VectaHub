import { execSync } from 'node:child_process';
import type { ICliDetector, CliDetectionResult } from '../types/provider.js';

export interface CliDetectorDeps {
  execCommand: (command: string, timeoutMs?: number) => string;
  logger: Pick<Console, 'warn' | 'error'>;
}

const defaultExecCommand = (command: string, timeoutMs = 5000): string => {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: timeoutMs }).trim();
  } catch {
    return '';
  }
};

const silentLogger: CliDetectorDeps['logger'] = {
  warn(): void {},
  error(): void {},
};

export class CliDetector implements ICliDetector {
  constructor(private readonly deps: CliDetectorDeps = { execCommand: defaultExecCommand, logger: silentLogger }) {}

  async detect(cliCommand: string): Promise<CliDetectionResult> {
    try {
      const path = this.findCommandPath(cliCommand);
      if (!path) {
        return { found: false, error: `Command '${cliCommand}' not found in PATH` };
      }

      const versionOutput = this.deps.execCommand(`${cliCommand} --version`, 3000);
      const helpOutput = this.deps.execCommand(`${cliCommand} --help`, 5000);

      const version = this.extractVersion(versionOutput);

      return {
        found: true,
        path,
        version,
        helpOutput: helpOutput || undefined,
        versionOutput: versionOutput || undefined,
      };
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private findCommandPath(command: string): string | null {
    try {
      const isWindows = process.platform === 'win32';
      const whichCmd = isWindows ? 'where' : 'which';
      const result = this.deps.execCommand(`${whichCmd} ${command}`, 3000);
      return result || null;
    } catch {
      return null;
    }
  }

  private extractVersion(output: string): string | undefined {
    if (!output) return undefined;

    const versionPatterns = [
      /version\s+([\d]+\.[\d]+\.[\d]+[^\s]*)/i,
      /v([\d]+\.[\d]+\.[\d]+[^\s]*)/,
      /([\d]+\.[\d]+\.[\d]+[^\s]*)/,
    ];

    for (const pattern of versionPatterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return output.split('\n')[0]?.trim() || undefined;
  }
}

let instance: ICliDetector | null = null;

export function getCliDetector(deps?: CliDetectorDeps): ICliDetector {
  if (!instance) {
    instance = new CliDetector(deps);
  }
  return instance;
}

export function resetCliDetector(): void {
  instance = null;
}
