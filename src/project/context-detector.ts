import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectContext } from '../nl/core/goal-types.js';

/**
 * 纯 Node 实现的项目上下文检测逻辑
 * 用于 CLI 和 VS 插件共享。
 */

export function detectPackageManager(cwd: string): ProjectContext['packageManager'] {
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'unknown';
}

export function detectPackageScripts(cwd: string): string[] {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return Object.keys(pkg.scripts || {});
  } catch {
    return [];
  }
}

export function detectGitRemote(cwd: string): string | undefined {
  const gitConfigPath = path.join(cwd, '.git', 'config');
  if (!fs.existsSync(gitConfigPath)) return undefined;
  try {
    const content = fs.readFileSync(gitConfigPath, 'utf-8');
    const match = content.match(/\[remote "origin"\]\s+url = (.+)/);
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

export function detectCiProvider(cwd: string): ProjectContext['ciProvider'] {
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) return 'github-actions';
  return 'unknown';
}

/**
 * 综合检测入口
 */
export function detectProjectContext(cwd: string = process.cwd()): ProjectContext {
  return {
    cwd,
    packageManager: detectPackageManager(cwd),
    packageScripts: detectPackageScripts(cwd),
    gitRemote: detectGitRemote(cwd),
    ciProvider: detectCiProvider(cwd),
  };
}
