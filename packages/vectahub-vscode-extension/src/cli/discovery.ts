import { exec } from 'child_process';
import { promisify } from 'util';
import { getCliPath } from '../config/settings.js';
import { platform } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

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

    const { stdout } = await execAsync(`${whichCmd} ${candidatePath}`);
    const paths = stdout.trim().split(/\r?\n/);
    if (paths.length > 0 && paths[0]) {
      return paths[0];
    }
  } catch {
    try {
      const { stdout } = await execAsync('npm root -g');
      const globalNodeModules = stdout.trim();
      const possiblePath = join(globalNodeModules, '.bin', candidatePath);

      await execAsync(`${possiblePath} --version`);
      return possiblePath;
    } catch {
    }
  }

  return null;
}

export async function discoverCli(): Promise<CliDiscoveryResult> {
  const cliPath = getCliPath();
  try {
    const { stdout } = await execAsync(`${cliPath} --version`);
    
    const absolutePath = await findCliAbsolutePath(cliPath);
    
    return {
      exists: true,
      version: stdout.trim(),
      path: absolutePath || cliPath
    };
  } catch (error: any) {
    return {
      exists: false,
      error: error.message
    };
  }
}
