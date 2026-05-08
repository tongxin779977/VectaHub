import * as path from 'path';
import * as fs from 'fs';

export type PackageManagerType = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectPackageManager(workspaceFolder: string): PackageManagerType {
  if (fs.existsSync(path.join(workspaceFolder, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(workspaceFolder, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(workspaceFolder, 'bun.lockb')) || fs.existsSync(path.join(workspaceFolder, 'bun.lock'))) {
    return 'bun';
  }
  return 'npm'; // Default to npm
}

export function getRunCommand(packageManager: PackageManagerType, script: string): { cli: string; args: string[] } {
  switch (packageManager) {
    case 'pnpm':
      return { cli: 'pnpm', args: ['run', script] };
    case 'yarn':
      return { cli: 'yarn', args: ['run', script] };
    case 'bun':
      return { cli: 'bun', args: ['run', script] };
    default:
      return { cli: 'npm', args: ['run', script] };
  }
}

export function getInstallCommand(packageManager: PackageManagerType): { cli: string; args: string[] } {
  switch (packageManager) {
    case 'pnpm':
      return { cli: 'pnpm', args: ['install'] };
    case 'yarn':
      return { cli: 'yarn', args: ['install'] };
    case 'bun':
      return { cli: 'bun', args: ['install'] };
    default:
      return { cli: 'npm', args: ['install'] };
  }
}
