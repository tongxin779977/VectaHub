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
    const { execSync } = require('child_process');
    execSync('opencli --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
