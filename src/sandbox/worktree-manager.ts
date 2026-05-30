import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../infrastructure/logger/index.js';

const logger = getLogger(import.meta.url);

export interface SandboxOptions {
  traceId: string;
  sourceCwd: string;
}

export interface SandboxContext {
  worktreePath: string;
  branchName: string;
  isFallback: boolean;
}

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

function toBranchName(traceId: string): string {
  return `vectahub/sandbox/${traceId}`;
}

/**
 * 创建工作树沙箱
 *
 * 优先使用 git worktree 创建隔离的工作目录，
 * 在非 git 环境下自动降级到 fs.cp 复制目录。
 *
 * @param options - 沙箱选项（traceId 和 sourceCwd）
 * @returns 沙箱上下文（包含工作树路径、分支名、是否降级标志）
 */
export async function createSandbox(options: SandboxOptions): Promise<SandboxContext> {
  const branchName = toBranchName(options.traceId);
  let isInsideWorktree: boolean;

  try {
    const inside = await execGit(['rev-parse', '--is-inside-work-tree'], options.sourceCwd);
    isInsideWorktree = inside === 'true';
  } catch {
    isInsideWorktree = false;
  }

  if (!isInsideWorktree) {
    const fallbackPath = join(options.sourceCwd, '.vectahub', 'worktrees', options.traceId);
    await rm(fallbackPath, { recursive: true, force: true });
    await mkdir(join(options.sourceCwd, '.vectahub', 'worktrees'), { recursive: true });
    await cp(options.sourceCwd, fallbackPath, {
      recursive: true,
      filter: (src: string) => !src.includes('/.vectahub') && !src.includes('\\.vectahub'),
    });
    return {
      worktreePath: fallbackPath,
      branchName,
      isFallback: true,
    };
  }

  const gitRoot = await execGit(['rev-parse', '--show-toplevel'], options.sourceCwd);
  const worktreePath = join(gitRoot, '.vectahub', 'worktrees', options.traceId);
  await mkdir(join(gitRoot, '.vectahub', 'worktrees'), { recursive: true });

  await rm(worktreePath, { recursive: true, force: true });
  rmSync(worktreePath, { recursive: true, force: true });

  try {
    await execGit(['branch', '-D', branchName], gitRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug({ error: message }, 'Branch deletion skipped (missing or detached)');
  }

  await execGit(['worktree', 'add', '-B', branchName, worktreePath, 'HEAD'], gitRoot);

  return {
    worktreePath,
    branchName,
    isFallback: false,
  };
}

/**
 * 清理工作树沙箱
 *
 * 移除 git worktree 并删除相关分支（git 模式），
 * 或直接删除复制的目录（降级模式）。
 *
 * @param context - 由 createSandbox 返回的沙箱上下文
 */
export async function teardownSandbox(context: SandboxContext): Promise<void> {
  const repoCwd = context.isFallback ? context.worktreePath : join(context.worktreePath, '..', '..', '..');

  if (context.isFallback) {
    await rm(context.worktreePath, { recursive: true, force: true });
    rmSync(context.worktreePath, { recursive: true, force: true });
    return;
  }

  try {
    await execGit(['worktree', 'remove', '--force', context.worktreePath], repoCwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Git worktree removal failed');
    // ignore
  }

  try {
    await execGit(['branch', '-D', context.branchName], repoCwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Git branch deletion failed');
    // ignore
  }

  await rm(context.worktreePath, { recursive: true, force: true });
  rmSync(context.worktreePath, { recursive: true, force: true });
}
