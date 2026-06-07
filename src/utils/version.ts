import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Cached version string to avoid repeated file reads. */
let cachedVersion: string | undefined;

/**
 * Read the package version from package.json.
 * Uses module-level caching to avoid repeated file system access.
 * @returns The package version string, or '0.0.0' if reading fails.
 */
export function getVersion(): string {
  if (!cachedVersion) {
    try {
      const pkgPath = [
        join(__dirname, '../package.json'),
        join(__dirname, '../../package.json'),
      ].find(candidate => existsSync(candidate));
      if (!pkgPath) {
        throw new Error('package.json not found');
      }
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent) as { version?: string };
      cachedVersion = pkg.version ?? '0.0.0';
    } catch {
      cachedVersion = '0.0.0';
    }
  }
  return cachedVersion!;
}
