import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createArchiver } from './archiver.js';

describe('Archiver', () => {
  let tmpBase: string;
  let execDir: string;
  let archiveDir: string;
  let archiver: ReturnType<typeof createArchiver>;

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'archiver-test-'));
    execDir = join(tmpBase, 'executions');
    archiveDir = join(tmpBase, 'archives');
    mkdirSync(execDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });

    archiver = createArchiver({
      baseDir: archiveDir,
      executionsDir: execDir,
    });
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  function writeRecord(id: string, date: string): void {
    const record = {
      executionId: id,
      workflowId: 'wf-1',
      workflowName: 'test',
      status: 'COMPLETED',
      startedAt: date,
      finishedAt: date,
      duration: 1000,
      steps: [],
    };
    const dateStr = date.slice(0, 10).replace(/-/g, '');
    const file = join(execDir, `${dateStr}.jsonl`);
    const line = JSON.stringify(record) + '\n';
    try {
      const existing = readFileSync(file, 'utf-8');
      writeFileSync(file, existing + line, 'utf-8');
    } catch {
      writeFileSync(file, line, 'utf-8');
    }
  }

  describe('archiveBefore', () => {
    it('should return zero count when no old records', async () => {
      const result = await archiver.archiveBefore(new Date('2020-01-01'));
      expect(result.archivedCount).toBe(0);
    });

    it('should archive records older than cutoff date', async () => {
      writeRecord('exec_old', '2026-01-15T10:00:00.000Z');
      const result = await archiver.archiveBefore(new Date('2026-06-01T00:00:00.000Z'));
      expect(result.archivedCount).toBeGreaterThan(0);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.archiveId).toMatch(/^archive_/);
    });
  });

  describe('listArchives', () => {
    it('should return empty array when no archives exist', async () => {
      const archives = await archiver.listArchives();
      expect(archives).toHaveLength(0);
    });

    it('should list existing archives', async () => {
      writeRecord('exec_old', '2026-01-15T10:00:00.000Z');
      await archiver.archiveBefore(new Date('2026-06-01T00:00:00.000Z'));

      const archives = await archiver.listArchives();
      expect(archives.length).toBeGreaterThan(0);
      expect(archives[0].archiveId).toMatch(/^archive_/);
    });
  });

  describe('deleteArchive', () => {
    it('should not throw when archive does not exist', async () => {
      await expect(archiver.deleteArchive('nonexistent')).resolves.toBeUndefined();
    });

    it('should remove existing archive', async () => {
      writeRecord('exec_old', '2026-01-15T10:00:00.000Z');
      const result = await archiver.archiveBefore(new Date('2026-06-01T00:00:00.000Z'));
      expect(existsSync(join(archiveDir, `${result.archiveId}.json.gz`))).toBe(true);

      await archiver.deleteArchive(result.archiveId);
      expect(existsSync(join(archiveDir, `${result.archiveId}.json.gz`))).toBe(false);
    });
  });
});
