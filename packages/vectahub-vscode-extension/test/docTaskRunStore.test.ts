import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockHome = '';

vi.mock('../src/cli/adapter.js', () => ({
  getVectaHubHome: () => mockHome
}));

import { createDocTaskRunStore } from '../src/project/docTaskRunStore.js';

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

describe('docTaskRunStore', () => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'vectahub-doc-run-store-'));
    mockHome = path.join(tempRoot, '.vectahub-home');
    await fsp.mkdir(mockHome, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  });

  it('start/update run 后 latest 可读取', async () => {
    const store = createDocTaskRunStore('/repo/a');
    const run = await store.startRun({
      runId: 'run-1',
      taskId: '1',
      taskLabel: 'task-1',
      agentCli: 'codex'
    });
    const updated = { ...run, status: 'success' as const, updatedAt: new Date().toISOString(), endedAt: new Date().toISOString() };
    await store.updateRun(updated);

    const latest = await store.getLatestByTaskId('1');
    expect(latest).toBeDefined();
    expect(latest?.status).toBe('success');
  });

  it('会追加写入 runs-YYYY-MM-DD.jsonl', async () => {
    const projectRoot = '/repo/jsonl';
    const store = createDocTaskRunStore(projectRoot);
    await store.startRun({
      runId: 'run-jsonl',
      taskId: '2',
      taskLabel: 'task-2',
      agentCli: 'codex'
    });

    const file = path.join(
      mockHome,
      'projects',
      djb2Hash(projectRoot),
      'doc-task-runs',
      `runs-${new Date().toISOString().slice(0, 10)}.jsonl`
    );
    expect(fs.existsSync(file)).toBe(true);
    const content = await fsp.readFile(file, 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content.includes('"runId":"run-jsonl"')).toBe(true);
  });

  it('大字段会被截断并标记 outputTruncated', async () => {
    const store = createDocTaskRunStore('/repo/truncate');
    const run = await store.startRun({
      runId: 'run-3',
      taskId: '3',
      taskLabel: 'task-3',
      agentCli: 'codex'
    });

    const hugeFiles = Array.from({ length: 300 }, (_, i) => `file-${i}-${'a'.repeat(100)}`);
    await store.updateRun({
      ...run,
      errorMessage: 'e'.repeat(5000),
      outputSummary: 'o'.repeat(8000),
      gitChanges: {
        changedFileCount: hugeFiles.length,
        changedFiles: hugeFiles,
        shortStat: 'changed'
      },
      updatedAt: new Date().toISOString()
    });

    const latest = await store.getLatestByTaskId('3');
    expect(latest).toBeDefined();
    expect((latest?.errorMessage ?? '').length).toBeLessThanOrEqual(1000);
    expect((latest?.outputSummary ?? '').length).toBeLessThanOrEqual(2000);
    expect(latest?.gitChanges?.changedFiles.length).toBeLessThanOrEqual(100);
    expect(latest?.outputTruncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(latest), 'utf8')).toBeLessThanOrEqual(16 * 1024);
  });

  it('listRuns limit 默认和最大值生效', async () => {
    const store = createDocTaskRunStore('/repo/list-limit');
    for (let i = 0; i < 140; i++) {
      await store.startRun({
        runId: `run-${i}`,
        taskId: `${i}`,
        taskLabel: `task-${i}`,
        agentCli: 'codex'
      });
    }

    const defaultList = await store.listRuns();
    expect(defaultList.length).toBe(100);

    const maxList = await store.listRuns({ limit: 1000 });
    expect(maxList.length).toBe(140);
  });

  it('batch start/update 可用', async () => {
    const store = createDocTaskRunStore('/repo/batch');
    const batch = await store.startBatch({
      batchRunId: 'batch-1',
      agentCli: 'codex',
      totalCount: 3
    });

    await store.updateBatch({
      ...batch,
      status: 'success',
      completedCount: 3,
      updatedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });

    const batchesFile = path.join(mockHome, 'projects', djb2Hash('/repo/batch'), 'doc-task-runs', 'batches.jsonl');
    const content = await fsp.readFile(batchesFile, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(content.includes('"batchRunId":"batch-1"')).toBe(true);
    expect(content.includes('"status":"success"')).toBe(true);
  });

  it('并发 updateRun 会串行写入 latest', async () => {
    const store = createDocTaskRunStore('/repo/concurrent-latest');
    const baseRuns = await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.startRun({
        runId: `run-concurrent-${index}`,
        taskId: `task-${index}`,
        taskLabel: `task ${index}`,
        agentCli: 'codex'
      }))
    );

    await Promise.all(baseRuns.map((run, index) => store.updateRun({
      ...run,
      status: 'success',
      updatedAt: new Date().toISOString(),
      outputSummary: `done-${index}`,
    })));

    const latest = await store.getLatestMap();
    expect(latest.size).toBe(20);
    for (let i = 0; i < 20; i += 1) {
      expect(latest.get(`task-${i}`)?.outputSummary).toBe(`done-${i}`);
    }
  });

  it('projectRoot 隔离路径稳定', async () => {
    const a = createDocTaskRunStore('/repo/x');
    const b = createDocTaskRunStore('/repo/y');
    await a.startRun({ runId: 'a-1', taskId: 'a', taskLabel: 'a', agentCli: 'codex' });
    await b.startRun({ runId: 'b-1', taskId: 'b', taskLabel: 'b', agentCli: 'codex' });

    const fileA = path.join(mockHome, 'projects', djb2Hash('/repo/x'), 'doc-task-runs', `runs-${new Date().toISOString().slice(0, 10)}.jsonl`);
    const fileB = path.join(mockHome, 'projects', djb2Hash('/repo/y'), 'doc-task-runs', `runs-${new Date().toISOString().slice(0, 10)}.jsonl`);
    expect(fileA).not.toBe(fileB);
    expect(fs.existsSync(fileA)).toBe(true);
    expect(fs.existsSync(fileB)).toBe(true);
  });
});
