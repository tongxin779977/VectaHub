import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

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

export async function createSandbox(options: SandboxOptions): Promise<SandboxContext> {
  const branchName = toBranchName(options.traceId);
  let isInsideWorktree = false;

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
  } catch {
    // ignore missing or detached residual branch
  }

  await execGit(['worktree', 'add', '-B', branchName, worktreePath, 'HEAD'], gitRoot);

  return {
    worktreePath,
    branchName,
    isFallback: false,
  };
}

export async function teardownSandbox(context: SandboxContext): Promise<void> {
  const repoCwd = context.isFallback ? context.worktreePath : join(context.worktreePath, '..', '..', '..');

  if (context.isFallback) {
    await rm(context.worktreePath, { recursive: true, force: true });
    rmSync(context.worktreePath, { recursive: true, force: true });
    return;
  }

  try {
    await execGit(['worktree', 'remove', '--force', context.worktreePath], repoCwd);
  } catch {
    // ignore
  }

  try {
    await execGit(['branch', '-D', context.branchName], repoCwd);
  } catch {
    // ignore
  }

  await rm(context.worktreePath, { recursive: true, force: true });
  rmSync(context.worktreePath, { recursive: true, force: true });
}
