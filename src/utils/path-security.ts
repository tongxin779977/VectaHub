import { normalize, resolve, isAbsolute } from 'path';
import { realpathSync } from 'fs';

export function normalizeAndValidatePath(
  path: string,
  allowedRoots: string[]
): { valid: boolean; normalized?: string; error?: string } {
  let normalized = isAbsolute(path) ? normalize(path) : resolve(path);

  try {
    normalized = realpathSync(normalized);
  } catch {
    // 文件不存在时 realpathSync 会抛错，用 normalize 结果即可
  }

  const resolvedRoots = allowedRoots.map(root => {
    try { return realpathSync(normalize(root)); }
    catch { return normalize(root); }
  });

  const inAllowedRoot = resolvedRoots.some(root =>
    normalized === root || normalized.startsWith(root + '/')
  );

  if (!inAllowedRoot) {
    return { valid: false, error: `Path "${path}" is outside allowed directories` };
  }

  const blockedPaths = ['/etc', '/root', '/boot', '/proc', '/sys'];
  for (const blocked of blockedPaths) {
    let resolvedBlocked: string;
    try { resolvedBlocked = realpathSync(blocked); }
    catch { resolvedBlocked = blocked; }
    if (normalized === resolvedBlocked || normalized.startsWith(resolvedBlocked + '/')) {
      return { valid: false, error: `Path "${path}" is in blocked directory` };
    }
  }

  return { valid: true, normalized };
}
