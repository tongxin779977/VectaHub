import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultContext } from '../infrastructure/context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Cached version string to avoid repeated file reads. */
let cachedVersion: string | undefined;

/**
 * Read the package version from package.json via the infrastructure environment service.
 * Uses module-level caching to avoid repeated file system access.
 * @returns The package version string, or '0.0.0' if reading fails.
 */
export function getVersion(): string {
  if (!cachedVersion) {
    try {
      const ctx = getDefaultContext();
      const pkgPath = join(__dirname, '../../package.json');
      const pkgContent = ctx.environment.readFile(pkgPath);
      const pkg = JSON.parse(pkgContent) as { version?: string };
      cachedVersion = pkg.version ?? '0.0.0';
    } catch {
      cachedVersion = '0.0.0';
    }
  }
  return cachedVersion!;
}
