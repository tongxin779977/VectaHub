import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { QueueManager } from './queue-manager.js';

describe('QueueManager', () => {
  let tempDir = '';
  let queueFile = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-queue-manager-'));
    queueFile = join(tempDir, 'diagnostic-queue.json');
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = '';
    queueFile = '';
  });

  it('returns empty tasks when queue file is missing', async () => {
    const manager = QueueManager.createForPath(queueFile);

    await expect(manager.loadTasks()).resolves.toEqual([]);
  });

  it('throws when queue file contains malformed JSON', async () => {
    writeFileSync(queueFile, '{bad json', 'utf-8');
    const manager = QueueManager.createForPath(queueFile);

    await expect(manager.loadTasks()).rejects.toThrow(`Failed to load diagnostic queue from ${queueFile}`);
  });

  it('throws when queue file contains invalid task entries', async () => {
    writeFileSync(queueFile, JSON.stringify([{ id: 'broken-task' }]), 'utf-8');
    const manager = QueueManager.createForPath(queueFile);

    await expect(manager.loadTasks()).rejects.toThrow(`Failed to load diagnostic queue from ${queueFile}`);
  });
});
