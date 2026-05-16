import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { QueueManager } from '../execution/queue-manager.js';
import type { DiagnosticTask } from '../types/diagnostic.js';
import { listPendingDiagnosticTasks, parseQueuedCommand, processDiagnosticTask } from './process-diagnostic-queue.js';

describe('process-diagnostic-queue', () => {
  let tempDir = '';

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = '';
  });

  async function createQueue(tasks: DiagnosticTask[]): Promise<QueueManager> {
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-queue-'));
    await mkdir(tempDir, { recursive: true });

    const queueManager = QueueManager.createForPath(join(tempDir, 'diagnostic-queue.json'));
    await queueManager.saveTasks(tasks);
    return queueManager;
  }

  it('parses a single queued command into executable tokens', () => {
    const parsed = parseQueuedCommand(`"${process.execPath}" --version`);

    expect(parsed.cli).toBe(process.execPath);
    expect(parsed.args).toEqual(['--version']);
  });

  it('preserves quoted arguments when parsing queued commands', () => {
    const parsed = parseQueuedCommand(`node dist/cli.js run --json "诊断队列读取失败"`);

    expect(parsed.cli).toBe('node');
    expect(parsed.args).toEqual(['dist/cli.js', 'run', '--json', '诊断队列读取失败']);
  });

  it('rejects compound queued commands', () => {
    expect(() => parseQueuedCommand('node one && node two')).toThrow('Queued command must be a single executable command');
  });

  it('lists only pending diagnostic tasks', async () => {
    const manager = await createQueue([
      {
        id: 'pending-1',
        title: 'Pending task',
        description: 'pending',
        source: 'manual',
        commandToFix: 'node --version',
        status: 'pending',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        id: 'done-1',
        title: 'Completed task',
        description: 'done',
        source: 'manual',
        commandToFix: 'node --version',
        status: 'completed',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const pending = await listPendingDiagnosticTasks(manager);

    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe('pending-1');
  });

  it('marks a task completed after a successful command run', async () => {
    const manager = await createQueue([
      {
        id: 'task-1',
        title: 'Run task',
        description: 'run',
        source: 'manual',
        commandToFix: `\"${process.execPath}\" --version`,
        status: 'pending',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'v1.0.0\n',
      stderr: '',
    });

    const result = await processDiagnosticTask('task-1', {
      queueManager: manager,
      runCommand,
    });

    const tasks = await manager.loadTasks();
    const task = tasks.find((entry) => entry.id === 'task-1');

    expect(runCommand).toHaveBeenCalledWith({
      cli: process.execPath,
      args: ['--version'],
    });
    expect(result.exitCode).toBe(0);
    expect(task?.status).toBe('completed');
    expect(task?.error).toBeUndefined();
  });

  it('marks a task failed after a non-zero command exit', async () => {
    const manager = await createQueue([
      {
        id: 'task-2',
        title: 'Fail task',
        description: 'fail',
        source: 'manual',
        commandToFix: 'node --version',
        status: 'pending',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'mock failure',
    });

    const result = await processDiagnosticTask('task-2', {
      queueManager: manager,
      runCommand,
    });

    const tasks = await manager.loadTasks();
    const task = tasks.find((entry) => entry.id === 'task-2');

    expect(result.exitCode).toBe(1);
    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('mock failure');
  });
});
