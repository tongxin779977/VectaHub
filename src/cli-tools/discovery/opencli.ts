import { execSync } from 'node:child_process';
import { getLogger } from '../../infrastructure/logger/index.js';

const moduleLogger = getLogger('opencli');

export const OPENCLI_TOOL = {
  id: 'opencli',
  name: 'opencli',
  version: '>=1.0.0',
  versionRequirement: '>=1.0.0',
  description: 'OpenCLI - Turn websites into deterministic CLI commands',
  checkCommand: 'opencli --version',
  checkOutputRegex: /opencli/,
  packageManager: 'npm',
  versionCommands: ['opencli --version'],
  categories: ['automation'],
  confidence: 0.90,
};

export function isOpencliInstalled(): boolean {
  try {
    execSync('opencli --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    moduleLogger.debug({ error: message }, 'opencli not installed or not accessible');
    return false;
  }
}
