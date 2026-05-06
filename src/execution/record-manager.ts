import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import type { ExecutionRecord, ExecutionFilter } from './types.js';

export interface RecordManager {
  save(record: ExecutionRecord): Promise<void>;
  get(id: string): Promise<ExecutionRecord | undefined>;
  list(filter?: ExecutionFilter): Promise<ExecutionRecord[]>;
  delete(id: string): Promise<boolean>;
}

function getDayFile(baseDir: string, dateStr: string): string {
  return join(baseDir, `${dateStr}.jsonl`);
}

function parseStartedAt(record: ExecutionRecord): string {
  return record.startedAt || '';
}

export function createRecordManager(baseDir?: string): RecordManager {
  const dir = baseDir || join(homedir(), '.vectahub', 'executions');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function readAllRecords(): Promise<ExecutionRecord[]> {
    await ensureDir();
    const files = await readdir(dir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    const records: ExecutionRecord[] = [];

    for (const file of jsonlFiles) {
      const content = await readFile(join(dir, file), 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        try {
          records.push(JSON.parse(line) as ExecutionRecord);
        } catch {
          // skip malformed lines
        }
      }
    }

    return records;
  }

  return {
    async save(record: ExecutionRecord): Promise<void> {
      await ensureDir();
      const dateStr = record.startedAt
        ? record.startedAt.slice(0, 10).replace(/-/g, '')
        : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filePath = getDayFile(dir, dateStr);
      const line = JSON.stringify(record) + '\n';
      try {
        const existing = await readFile(filePath, 'utf-8');
        await writeFile(filePath, existing + line, 'utf-8');
      } catch {
        await writeFile(filePath, line, 'utf-8');
      }
    },

    async get(id: string): Promise<ExecutionRecord | undefined> {
      const records = await readAllRecords();
      return records.find((r) => r.executionId === id);
    },

    async list(filter?: ExecutionFilter): Promise<ExecutionRecord[]> {
      let records = await readAllRecords();

      if (filter?.workflowId) {
        records = records.filter((r) => r.workflowId === filter.workflowId);
      }
      if (filter?.status) {
        records = records.filter((r) => r.status === filter.status);
      }
      if (filter?.from) {
        records = records.filter((r) => parseStartedAt(r) >= filter.from!);
      }
      if (filter?.to) {
        records = records.filter((r) => parseStartedAt(r) <= filter.to!);
      }
      if (filter?.grep) {
        const grepLower = filter.grep.toLowerCase();
        records = records.filter(
          (r) =>
            r.workflowName.toLowerCase().includes(grepLower) ||
            r.workflowId.toLowerCase().includes(grepLower)
        );
      }

      records.sort((a, b) => parseStartedAt(b).localeCompare(parseStartedAt(a)));

      const offset = filter?.offset || 0;
      const limit = filter?.limit;
      if (limit !== undefined) {
        records = records.slice(offset, offset + limit);
      } else if (offset > 0) {
        records = records.slice(offset);
      }

      return records;
    },

    async delete(id: string): Promise<boolean> {
      const records = await readAllRecords();
      const index = records.findIndex((r) => r.executionId === id);
      if (index === -1) return false;

      records.splice(index, 1);

      // Rewrite all files
      const grouped = new Map<string, ExecutionRecord[]>();
      for (const r of records) {
        const dateStr = r.startedAt
          ? r.startedAt.slice(0, 10).replace(/-/g, '')
          : 'unknown';
        if (!grouped.has(dateStr)) grouped.set(dateStr, []);
        grouped.get(dateStr)!.push(r);
      }

      await ensureDir();
      const files = await readdir(dir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      // Remove old files
      for (const file of jsonlFiles) {
        const { unlink } = await import('node:fs/promises');
        await unlink(join(dir, file));
      }

      // Write back remaining records
      for (const [dateStr, recs] of grouped) {
        const content = recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
        await writeFile(join(dir, `${dateStr}.jsonl`), content, 'utf-8');
      }

      return true;
    },
  };
}
