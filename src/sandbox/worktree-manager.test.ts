import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
const cpMock = vi.fn();
const rmMock = vi.fn();
const rmSyncMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('node:fs', () => ({
  rmSync: rmSyncMock,
}));

vi.mock('node:fs/promises', () => ({
  cp: cpMock,
  rm: rmMock,
  mkdir: mkdirMock,
}));

describe('worktree-manager', () => {
  const callExecCallback = (
    _cmd: string,
    _args: string[],
    maybeOptions: unknown,
    maybeCallback?: (err: Error | null, stdout: string) => void,
  ): ((err: Error | null, stdout: string) => void) => {
    if (typeof maybeOptions === 'function') return maybeOptions as (err: Error | null, stdout: string) => void;
    if (maybeCallback) return maybeCallback;
    throw new Error('missing callback');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    cpMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    rmSyncMock.mockReturnValue(undefined);
  });

  it('should create git worktree sandbox under gitRoot/.vectahub/worktrees/<traceId>', async () => {
    execFileMock
      .mockImplementationOnce((cmd: string, args: string[], options: unknown, cb?: (err: Error | null, stdout: string) => void) => {
        callExecCallback(cmd, args, options, cb)(null, 'true\n');
      })
      .mockImplementationOnce((cmd: string, args: string[], options: unknown, cb?: (err: Error | null, stdout: string) => void) => {
        callExecCallback(cmd, args, options, cb)(null, '/repo/root\n');
      })
      .mockImplementationOnce((cmd: string, args: string[], options: unknown, cb?: (err: Error | null, stdout: string) => void) => {
        callExecCallback(cmd, args, options, cb)(new Error('branch missing'), '');
      })
      .mockImplementationOnce((cmd: string, args: string[], options: unknown, cb?: (err: Error | null, stdout: string) => void) => {
        callExecCallback(cmd, args, options, cb)(null, '');
      });

    const { createSandbox } = await import('./worktree-manager.js');
    const ctx = await createSandbox({ traceId: 'trace-001', sourceCwd: '/repo/root/packages/a' });

    expect(ctx.isFallback).toBe(false);
    expect(ctx.worktreePath).toContain('/repo/root/.vectahub/worktrees/trace-001');
    expect(execFileMock.mock.calls.map(([, args]) => args)).toEqual([
      ['rev-parse', '--is-inside-work-tree'],
      ['rev-parse', '--show-toplevel'],
      ['branch', '-D', 'vectahub/sandbox/trace-001'],
      ['worktree', 'add', '-B', 'vectahub/sandbox/trace-001', '/repo/root/.vectahub/worktrees/trace-001', 'HEAD'],
    ]);
  });

  it('should fallback to fs.cp when sourceCwd is not inside git worktree and exclude .vectahub', async () => {
    execFileMock.mockImplementationOnce((cmd: string, args: string[], options: unknown, cb?: (err: Error | null, stdout: string) => void) => {
      callExecCallback(cmd, args, options, cb)(new Error('not a git repository'), '');
    });

    const { createSandbox } = await import('./worktree-manager.js');
    const ctx = await createSandbox({ traceId: 'trace-fallback', sourceCwd: '/tmp/no-git-project' });

    expect(ctx.isFallback).toBe(true);
    expect(cpMock).toHaveBeenCalledTimes(1);
    const cpOptions = cpMock.mock.calls[0]?.[2] as { filter?: (src: string) => boolean };
    expect(cpOptions.filter).toBeTypeOf('function');
    expect(cpOptions.filter?.('/tmp/no-git-project/.vectahub/cache')).toBe(false);
  });

  it('should always hard-delete worktreePath via fs.rmSync fallback during teardown', async () => {
    execFileMock.mockImplementation((cmd: string, args: string[], options: unknown, cb?: (err: Error | null, stdout: string) => void) => {
      callExecCallback(cmd, args, options, cb)(new Error('git remove failed'), '');
    });

    const { teardownSandbox } = await import('./worktree-manager.js');
    await teardownSandbox({
      worktreePath: '/repo/root/.vectahub/worktrees/trace-clean',
      branchName: 'vectahub/sandbox/trace-clean',
      isFallback: false,
    });

    expect(rmSyncMock).toHaveBeenCalledWith('/repo/root/.vectahub/worktrees/trace-clean', { recursive: true, force: true });
  });
});
