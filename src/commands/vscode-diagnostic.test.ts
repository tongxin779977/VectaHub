import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDefaultContext } from '../infrastructure/context.js';
import { vscodeDiagnosticCmd } from './vscode-diagnostic.js';

describe('vscode diagnostic command output', () => {
  let oldHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-vscode-diagnostic-'));
    process.env.VECTAHUB_HOME = tempHome;
    writeFileSync(join(tempHome, 'bridge-port'), 'not-a-port', 'utf-8');
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  it('prints a single JSON error payload on --json failure path', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(
      vscodeDiagnosticCmd.parseAsync(['diagnostic', '--json'], { from: 'user' }),
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
      vscodeDiagnosticCmd.parseAsync(['diagnostic'], { from: 'user' }),
    ).rejects.toThrow('Invalid bridge port: not-a-port');

    expect(stdoutSpy).not.toHaveBeenCalled();
    const rendered = stderrSpy.mock.calls.map((call) => String(call[0] ?? '')).join('');
    expect(rendered).toContain('❌ Invalid bridge port: not-a-port');
    expect(rendered).toContain('Make sure VSCode is open');
  });
});
