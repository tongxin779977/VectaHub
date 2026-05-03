import { normalize, resolve, isAbsolute } from 'path';

export function normalizeAndValidatePath(
  path: string,
  allowedRoots: string[]
): { valid: boolean; normalized?: string; error?: string } {
  // 规范化路径
  let normalized = isAbsolute(path) ? normalize(path) : resolve(path);
  
  // 检查是否在允许的根目录下
  const inAllowedRoot = allowedRoots.some(root => {
    const resolvedRoot = normalize(root);
    return normalized.startsWith(resolvedRoot);
  });
  
  if (!inAllowedRoot) {
    return {
      valid: false,
      error: `Path "${path}" is outside allowed directories`
    };
  }
  
  // 检查是否在禁止路径
  const blockedPaths = ['/etc', '/root', '/boot', '/proc', '/sys'];
  for (const blocked of blockedPaths) {
    if (normalized.startsWith(blocked)) {
      return {
        valid: false,
        error: `Path "${path}" is in blocked directory`
      };
    }
  }
  
  return { valid: true, normalized };
}
