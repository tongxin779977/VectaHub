import { platform } from 'os';

export const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec';
export const BWRAP_PATH = '/usr/bin/bwrap';
export const UNSHARE_PATH = '/usr/bin/unshare';
export const SUDOERS_PATH = '/etc/sudoers.d/vectahub';
export const FALLBACK_PATH = '/usr/bin:/bin:/usr/local/bin';

export const DEFAULT_PROTECTED_DIRS = [
  '/etc/',
  '/usr/',
  '/System/',
  '/bin/',
  '/sbin/',
  '/Library/',
];

export function getToolPaths(): { sandboxExec: string; bwrap: string; unshare: string } {
  const os = platform();
  if (os === 'darwin') {
    return { sandboxExec: SANDBOX_EXEC_PATH, bwrap: '', unshare: '' };
  }
  return { sandboxExec: '', bwrap: BWRAP_PATH, unshare: UNSHARE_PATH };
}
