import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { djb2Hash } from '../infrastructure/paths/index.js';
import { docTaskRunsCmd, listRecentRuns, readLatestRuns, findRunById } from './doc-task-runs.js';
import { resetDefaultContext } from '../infrastructure/context.js';

function dateFileName(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `runs-${y}-${m}-${day}.jsonl`;
}

function createStore(baseHome: string, projectRoot: string): string {
  const hash = djb2Hash(resolve(projectRoot));
  const dir = join(baseHome, 'projects', hash, 'doc-task-runs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('doc-task-runs command', () => {
  let oldHome: string | undefined;
  let tempHome: string;
  let projectRoot: string;

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    projectRoot = mkdtempSync(join(tmpdir(), 'vectahub-project-'));
    process.env.VECTAHUB_HOME = tempHome;
    resetDefaultContext();
  });

  afterEach(() => {
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  it('list/latest/show 能读取记录并按 json 输出', async () => {
    const storeDir = createStore(tempHome, projectRoot);
    const todayFile = join(storeDir, dateFileName(0));
    writeFileSync(todayFile, [
      JSON.stringify({ runId: 'run-1', taskId: 'P1-1', status: 'running', updatedAt: '2026-05-13T10:00:00.000Z' }),
      JSON.stringify({ runId: 'run-2', taskId: 'P1-2', status: 'success', updatedAt: '2026-05-13T11:00:00.000Z' }),
    ].join('\n'));
    writeFileSync(join(storeDir, 'latest.json'), JSON.stringify([
      { runId: 'run-2', taskId: 'P1-2', status: 'success' },
    ]));

    const listResult = listRecentRuns({ project: projectRoot, json: true });
    expect(listResult.runs.length).toBe(2);
    expect(listResult.runs[0].runId).toBe('run-2');

    const latestResult = readLatestRuns(projectRoot);
    expect(latestResult).toHaveLength(1);
    expect(latestResult[0].runId).toBe('run-2');

    const showResult = findRunById('run-1', projectRoot);
    expect(showResult?.taskId).toBe('P1-1');

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await docTaskRunsCmd.parseAsync(['latest', '--project', projectRoot, '--json'], { from: 'user' });
    expect(stdoutSpy).toHaveBeenCalled();
    const payload = stdoutSpy.mock.calls.map((call) => String(call[0] ?? '')).join('');
    expect(payload).toContain('"ok":true');
    expect(payload).toContain('"tasks"');
  });

  it('list 的 limit 与 status/failure-kind 过滤生效', () => {
    const storeDir = createStore(tempHome, projectRoot);
    writeFileSync(join(storeDir, dateFileName(0)), [
      JSON.stringify({ runId: 'run-1', status: 'failed_agent', failureKind: 'agent' }),
      JSON.stringify({ runId: 'run-2', status: 'failed_timeout', failureKind: 'timeout' }),
      JSON.stringify({ runId: 'run-3', status: 'success' }),
    ].join('\n'));

    const filtered = listRecentRuns({
      project: projectRoot,
      limit: '1',
      status: 'failed_timeout',
      failureKind: 'timeout',
    });
    expect(filtered.runs).toHaveLength(1);
    expect(filtered.runs[0].runId).toBe('run-2');
    expect(filtered.hasMore).toBe(false);
  });

  it('list 会跳过 malformed JSONL 行，且只读取最近 7 天', () => {
    const storeDir = createStore(tempHome, projectRoot);
    writeFileSync(join(storeDir, dateFileName(0)), [
      '{"runId":"run-ok-1","status":"running"}',
      '{not-json-line',
      '{"runId":"run-ok-2","status":"success"}',
    ].join('\n'));
    writeFileSync(join(storeDir, dateFileName(8)), JSON.stringify({ runId: 'run-old', status: 'success' }));

    const result = listRecentRuns({ project: projectRoot });
    expect(result.runs.map(r => r.runId)).toEqual(['run-ok-2', 'run-ok-1']);
    expect(result.runs.find(r => r.runId === 'run-old')).toBeUndefined();
  });

  it('空目录或缺文件返回 ok 语义的空结果', () => {
    const storeDir = createStore(tempHome, projectRoot);
    const listResult = listRecentRuns({ project: projectRoot });
    expect(listResult.runs).toEqual([]);
    expect(listResult.hasMore).toBe(false);

    const latestResult = readLatestRuns(projectRoot);
    expect(latestResult).toEqual([]);

    const showResult = findRunById('missing-run', projectRoot);
    expect(showResult).toBeUndefined();

    rmSync(storeDir, { recursive: true, force: true });
    const listWhenDirMissing = listRecentRuns({ project: projectRoot });
    expect(listWhenDirMissing.runs).toEqual([]);
    expect(listWhenDirMissing.hasMore).toBe(false);
  });

  it('uses UTC date window to include newest UTC-named file around local-date rollover', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-16T00:30:00.000+14:00'));
      const storeDir = createStore(tempHome, projectRoot);
      writeFileSync(join(storeDir, 'runs-2026-05-15.jsonl'), JSON.stringify({ runId: 'run-utc-latest', status: 'success' }));

      const result = listRecentRuns({ project: projectRoot });
      expect(result.runs.map(r => r.runId)).toContain('run-utc-latest');
    } finally {
      vi.useRealTimers();
    }
  });
});
