import { exec } from 'child_process';
import { promisify } from 'util';
import { getCliPath } from '../config/settings.js';

const execAsync = promisify(exec);

export interface CliDiscoveryResult {
  exists: boolean;
  version?: string;
  error?: string;
}

export async function discoverCli(): Promise<CliDiscoveryResult> {
  const cliPath = getCliPath();
  try {
    const { stdout } = await execAsync(`${cliPath} --version`);
    return {
      exists: true,
      version: stdout.trim()
    };
  } catch (error: any) {
    return {
      exists: false,
      error: error.message
    };
  }
}
