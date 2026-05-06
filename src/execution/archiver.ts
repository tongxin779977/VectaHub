import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ArchiveInfo, ArchiveResult } from './types.js';

export interface Archiver {
  archiveBefore(date: Date): Promise<ArchiveResult>;
  listArchives(): Promise<ArchiveInfo[]>;
  restore(archiveId: string): Promise<void>;
  deleteArchive(archiveId: string): Promise<void>;
}

interface ArchiveEntry {
  executionId: string;
  startedAt: string;
}

export function createArchiver(options?: {
  baseDir?: string;
  executionsDir?: string;
  archiveAge?: number;
}): Archiver {
  const baseDir = options?.baseDir || join(homedir(), '.vectahub', 'archives');
  const executionsDir = options?.executionsDir || join(homedir(), '.vectahub', 'executions');

  async function ensureDir(): Promise<void> {
    await mkdir(baseDir, { recursive: true });
  }

  async function findOldRecords(cutoffDate: Date): Promise<{ old: ArchiveEntry[] }> {
    const files = await readdir(executionsDir).catch(() => [] as string[]);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    const old: ArchiveEntry[] = [];

    for (const file of jsonlFiles) {
      const content = await readFile(join(executionsDir, file), 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          const startedAt = (record.startedAt as string) || '';
          if (startedAt && new Date(startedAt) < cutoffDate) {
            old.push({
              executionId: record.executionId as string,
              startedAt,
            });
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return { old };
  }

  return {
    async archiveBefore(date: Date): Promise<ArchiveResult> {
      await ensureDir();
      const { old } = await findOldRecords(date);

      if (old.length === 0) {
        return {
          archiveId: `archive_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`,
          archivedCount: 0,
          originalSize: 0,
          compressedSize: 0,
          compressionRatio: 0,
        };
      }

      const startedAt = old[0].startedAt;
      const startedAtStr = typeof startedAt === 'object' && startedAt !== null && 'toISOString' in startedAt
        ? (startedAt as Date).toISOString()
        : String(startedAt || '');
      const archiveId = `archive_${startedAtStr.slice(0, 7).replace('-', '')}`;
      const archivePath = join(baseDir, `${archiveId}.json.gz`);

      const jsonContent = old.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      const originalSize = Buffer.byteLength(jsonContent, 'utf-8');

      const gzip = createGzip();
      const writeStream = createWriteStream(archivePath);

      await pipeline(Readable.from(jsonContent), gzip, writeStream);

      const stats = await stat(archivePath);
      const compressedSize = stats.size;
      const compressionRatio = originalSize > 0 ? 1 - compressedSize / originalSize : 0;

      return {
        archiveId,
        archivedCount: old.length,
        originalSize,
        compressedSize,
        compressionRatio,
      };
    },

    async listArchives(): Promise<ArchiveInfo[]> {
      await ensureDir();
      const files = await readdir(baseDir);
      const gzFiles = files.filter((f) => f.endsWith('.json.gz'));

      const archives: ArchiveInfo[] = [];
      for (const file of gzFiles) {
        const archiveId = file.replace('.json.gz', '');
        const stats = await stat(join(baseDir, file));
        archives.push({
          archiveId,
          archivedCount: 0,
          createdAt: stats.mtime.toISOString(),
          originalSize: 0,
          compressedSize: stats.size,
          compressionRatio: 0,
        });
      }

      return archives;
    },

    async restore(archiveId: string): Promise<void> {
      const archivePath = join(baseDir, `${archiveId}.json.gz`);
      const execPath = join(executionsDir, `${archiveId}.jsonl`);

      const gunzip = createGunzip();
      await pipeline(
        createReadStream(archivePath),
        gunzip,
        createWriteStream(execPath),
      );
    },

    async deleteArchive(archiveId: string): Promise<void> {
      const archivePath = join(baseDir, `${archiveId}.json.gz`);
      try {
        await rm(archivePath, { force: true });
      } catch {
        // file may not exist
      }
    },
  };
}
