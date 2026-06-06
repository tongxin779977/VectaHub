import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCliPath } from '../config/settings.js';
import { platform } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export interface CliDiscoveryResult {
  exists: boolean;
  version?: string;
  path?: string;
  error?: string;
}

async function findCliAbsolutePath(candidatePath: string): Promise<string | null> {
  if (candidatePath.includes('/') || candidatePath.includes('\\')) {
    return candidatePath;
  }

  try {
    const isWindows = platform() === 'win32';
    const whichCmd = isWindows ? 'where' : 'which';

    const { stdout } = await execFileAsync(whichCmd, [candidatePath]);
    const paths = stdout.trim().split(/\r?\n/);
    if (paths.length > 0 && paths[0]) {
      return paths[0];
    }
  } catch {
    // Ignore if which command fails
    try {
      const { stdout } = await execFileAsync('npm', ['root', '-g']);
      const globalNodeModules = stdout.trim();
      const possiblePath = join(globalNodeModules, '.bin', candidatePath);

      await execFileAsync(possiblePath, ['--version']);
      return possiblePath;
    } catch {
      // Ignore if npm root or version check fails
    }
  }

  return null;
}

export async function discoverCli(): Promise<CliDiscoveryResult> {
  const cliPath = getCliPath();
  try {
    const { stdout } = await execFileAsync(cliPath, ['--version']);
    
    const absolutePath = await findCliAbsolutePath(cliPath);
    
    return {
      exists: true,
      version: stdout.trim(),
      path: absolutePath || cliPath
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      exists: false,
      error: err.message
    };
  }
}
