import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import { createTraceCmd } from './trace.js';

describe('trace command', () => {
  let oldHome: string | undefined;
  let tempHome: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  function getStdoutText(): string {
    return stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
  }

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-trace-home-'));
    process.env.VECTAHUB_HOME = tempHome;
    resetDefaultContext();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
    resetDefaultContext();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses UTC date window for recent trace files around local-date rollover', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:30:00.000+14:00'));

    const traceDir = join(tempHome, 'logs', 'traces');
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, '2026-05-15.jsonl'), JSON.stringify({
      traceId: 'tr-utc-latest',
      spanId: 'sp-1',
      name: 'cli.run-task',
      source: 'cli',
      status: 'completed',
      startTime: '2026-05-15T10:00:00.000Z',
      endTime: '2026-05-15T10:00:01.000Z',
      durationMs: 1000,
    }) + '\n');

    await createTraceCmd(getDefaultContext()).parseAsync(['list', '--json'], { from: 'user' });

    const payload = getStdoutText();
    expect(payload).toContain('"traceId": "tr-utc-latest"');
  });

  it('also accepts local-calendar recent filename around UTC rollover', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T23:30:00.000-11:00'));

    const traceDir = join(tempHome, 'logs', 'traces');
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, '2026-05-15.jsonl'), JSON.stringify({
      traceId: 'tr-local-recent',
      spanId: 'sp-2',
      name: 'cli.trace.list',
      source: 'cli',
      status: 'completed',
      startTime: '2026-05-15T09:00:00.000Z',
      endTime: '2026-05-15T09:00:01.000Z',
      durationMs: 1000,
    }) + '\n');

    await createTraceCmd(getDefaultContext()).parseAsync(['list', '--json'], { from: 'user' });

    const payload = getStdoutText();
    expect(payload).toContain('"traceId": "tr-local-recent"');
  });

  it('accepts legacy trace filename on list json path', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:30:00.000+14:00'));

    const traceDir = join(tempHome, 'logs', 'traces');
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, '2026-05-15-traces.jsonl'), JSON.stringify({
      traceId: 'tr-legacy-list',
      spanId: 'sp-legacy-1',
      name: 'cli.trace.list',
      source: 'cli',
      status: 'completed',
      startTime: '2026-05-15T10:00:00.000Z',
      endTime: '2026-05-15T10:00:01.000Z',
      durationMs: 1000,
    }) + '\n');

    await createTraceCmd(getDefaultContext()).parseAsync(['list', '--json'], { from: 'user' });

    const payload = getStdoutText();
    expect(payload).toContain('"traceId": "tr-legacy-list"');
  });

  it('accepts legacy trace filename on show json path', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:30:00.000+14:00'));

    const traceDir = join(tempHome, 'logs', 'traces');
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, '2026-05-15-traces.jsonl'), JSON.stringify({
      traceId: 'tr-legacy-show',
      spanId: 'sp-legacy-2',
      name: 'cli.trace.show',
      source: 'cli',
      status: 'completed',
      startTime: '2026-05-15T11:00:00.000Z',
      endTime: '2026-05-15T11:00:01.000Z',
      durationMs: 1000,
    }) + '\n');

    await createTraceCmd(getDefaultContext()).parseAsync(['show', 'tr-legacy-show', '--json'], { from: 'user' });

    const payload = getStdoutText();
    expect(payload).toContain('"traceId": "tr-legacy-show"');
    expect(payload).toContain('"spanId": "sp-legacy-2"');
  });

  it('shows specified trace even when the file is older than the recent list window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:30:00.000+14:00'));

    const traceDir = join(tempHome, 'logs', 'traces');
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, '2026-03-01.jsonl'), JSON.stringify({
      traceId: 'tr-older-show',
      spanId: 'sp-older-1',
      name: 'cli.run-task',
      source: 'cli',
      status: 'completed',
      startTime: '2026-03-01T10:00:00.000Z',
      endTime: '2026-03-01T10:00:01.000Z',
      durationMs: 1000,
    }) + '\n');

    await createTraceCmd(getDefaultContext()).parseAsync(['show', 'tr-older-show', '--json'], { from: 'user' });

    const payload = getStdoutText();
    expect(payload).toContain('"traceId": "tr-older-show"');
    expect(payload).toContain('"spanId": "sp-older-1"');
  });
});
