import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import { createVscodeDiagnosticCmd } from './vscode-diagnostic.js';

describe('vscode diagnostic command output', () => {
  let oldHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-vscode-diagnostic-'));
    process.env.VECTAHUB_HOME = tempHome;
    writeFileSync(join(tempHome, 'bridge-port'), 'not-a-port', 'utf-8');
    resetDefaultContext();
    // action 的 catch 分支会调 logger.error(),触发 pino/file worker 异步
    // 落盘到 <tempHome>/logs/app/<date>.log。worker 的 open 晚于本 afterEach
    // 的 rmSync(tempHome) 时,父目录已不存在 → ENOENT;macOS CI 上浮为
    // vitest unhandled error → exit 1。muted 后 worker 不 IO,避开 race。
    getDefaultContext().logger.setMuted(true);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
    // 还原 muted 状态,防止泄漏到后续 test file 的 default context worker。
    const ctx = getDefaultContext();
    ctx.logger.setMuted(false);
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  it('prints a single JSON error payload on --json failure path', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(
      createVscodeDiagnosticCmd(getDefaultContext()).parseAsync(['diagnostic', '--json'], { from: 'user' }),
    ).rejects.toThrow('Invalid bridge port: not-a-port');

    expect(stdoutSpy).toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();

    const payload = stdoutSpy.mock.calls.map((call) => String(call[0] ?? '')).join('');
    expect(() => JSON.parse(payload)).not.toThrow();
    expect(payload).toContain('"ok":false');
    expect(payload).toContain('"error":"Invalid bridge port: not-a-port"');
  });

  it('prints user-facing stderr guidance on text failure path', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(
      createVscodeDiagnosticCmd(getDefaultContext()).parseAsync(['diagnostic'], { from: 'user' }),
    ).rejects.toThrow('Invalid bridge port: not-a-port');

    expect(stdoutSpy).not.toHaveBeenCalled();
    const rendered = stderrSpy.mock.calls.map((call) => String(call[0] ?? '')).join('');
    expect(rendered).toContain('❌ Invalid bridge port: not-a-port');
    expect(rendered).toContain('Make sure VSCode is open');
  });
});
