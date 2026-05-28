import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultContext } from '../infrastructure/context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedVersion: string | undefined;

/** Read the package version from package.json via the infrastructure environment service. */
export function getVersion(): string {
  if (!cachedVersion) {
    try {
      const ctx = getDefaultContext();
      const pkgPath = join(__dirname, '../../package.json');
      const pkgContent = ctx.environment.readFile(pkgPath);
      const pkg = JSON.parse(pkgContent);
      cachedVersion = pkg.version;
    } catch {
      cachedVersion = '0.0.0';
    }
  }
  return cachedVersion!;
}
