import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import type { ExecutionRecord, ExecutionFilter, ExecutionSearchResult, ExecutionMetadata } from './types.js';

export interface RecordManager {
  save(record: ExecutionRecord): Promise<void>;
  get(id: string): Promise<ExecutionRecord | undefined>;
  list(filter?: ExecutionFilter): Promise<ExecutionRecord[]>;
  delete(id: string): Promise<boolean>;
  search(query: string, options?: { limit?: number; status?: string }): Promise<ExecutionSearchResult>;
  getMetadata(id: string): Promise<ExecutionMetadata | undefined>;
  getLatest(status?: string): Promise<ExecutionRecord | undefined>;
  getRecent(limit?: number): Promise<ExecutionRecord[]>;
}

function getDayFile(baseDir: string, dateStr: string): string {
  return join(baseDir, `${dateStr}.jsonl`);
}

function parseStartedAt(record: ExecutionRecord): string {
  const raw = record.startedAt;
  const startedAtStr = typeof raw === 'object' && raw !== null && 'toISOString' in raw
    ? (raw as Date).toISOString()
    : String(raw);
  return startedAtStr;
}

export function createRecordManager(baseDir?: string): RecordManager {
  const dir = baseDir || join(homedir(), '.vectahub', 'executions');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /**
   * Reads records from disk in reverse chronological order.
   * Optimization: Stops reading files once the required limit is met.
   */
  async function readRecords(options: { limit?: number; filter?: (r: ExecutionRecord) => boolean } = {}): Promise<ExecutionRecord[]> {
    await ensureDir();
    const files = await readdir(dir);
    // Sort files in reverse order to get newest dates first
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort().reverse();
    const records: ExecutionRecord[] = [];
    const targetLimit = options.limit || Infinity;

    for (const file of jsonlFiles) {
      if (records.length >= targetLimit) break;

      const content = await readFile(join(dir, file), 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim()).reverse(); // Newest in file first
      
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as ExecutionRecord;
          
          // Runtime type guard and transformation
          if (record.startedAt) {
            record.startedAt = new Date(record.startedAt);
          }
          if (record.endedAt) {
            record.endedAt = new Date(record.endedAt);
          }

          if (!options.filter || options.filter(record)) {
            records.push(record);
            if (records.length >= targetLimit) break;
          }
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
      const raw = record.startedAt;
      const startedAtStr = typeof raw === 'object' && raw !== null && 'toISOString' in raw
        ? (raw as Date).toISOString()
        : (typeof raw === 'string' ? raw : new Date().toISOString());
      
      const dateStr = startedAtStr.slice(0, 10).replace(/-/g, '');
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
      // For get by ID, we might still need to search through records, but we can stop at first match
      const records = await readRecords({ 
        filter: (r) => r.executionId === id,
        limit: 1 
      });
      return records[0];
    },

    async list(filter?: ExecutionFilter): Promise<ExecutionRecord[]> {
      const offset = filter?.offset || 0;
      const limit = filter?.limit || 50;
      
      const records = await readRecords({
        limit: offset + limit,
        filter: (r) => {
          if (filter?.workflowId && r.workflowId !== filter.workflowId) return false;
          if (filter?.status && r.status !== filter.status) return false;
          if (filter?.from && parseStartedAt(r) < filter.from) return false;
          if (filter?.to && parseStartedAt(r) > filter.to) return false;
          if (filter?.grep) {
            const grepLower = filter.grep.toLowerCase();
            if (!r.workflowName.toLowerCase().includes(grepLower) && 
                !r.workflowId.toLowerCase().includes(grepLower)) return false;
          }
          return true;
        }
      });

      // Since readRecords already returns newest first, we just need to slice
      return records.slice(offset);
    },

    async delete(id: string): Promise<boolean> {
      // Deletion still requires full rewrite of affected file(s), so we read all for now
      // but only in the affected date's file if we were really aggressive.
      // Keeping original full read for delete to ensure safety across files.
      const allRecords = await readRecords(); 
      const index = allRecords.findIndex((r) => r.executionId === id);
      if (index === -1) return false;

      allRecords.splice(index, 1);

      // Rewrite all files
      const grouped = new Map<string, ExecutionRecord[]>();
<<<<<<< HEAD
      for (const r of allRecords) {
=======
      for (const r of records) {
>>>>>>> origin/main
        const raw = r.startedAt;
        const startedAtStr = typeof raw === 'object' && raw !== null && 'toISOString' in raw
          ? (raw as Date).toISOString()
          : (typeof raw === 'string' ? raw : 'unknown');
        
        const dateStr = startedAtStr !== 'unknown'
          ? startedAtStr.slice(0, 10).replace(/-/g, '')
          : 'unknown';
          
        if (!grouped.has(dateStr)) grouped.set(dateStr, []);
        grouped.get(dateStr)!.push(r);
      }

      await ensureDir();
      const files = await readdir(dir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const { unlink } = await import('node:fs/promises');
        await unlink(join(dir, file));
      }

      for (const [dateStr, recs] of grouped) {
        const content = recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
        await writeFile(join(dir, `${dateStr}.jsonl`), content, 'utf-8');
      }

      return true;
    },

    async search(query: string, options?: { limit?: number; status?: string }): Promise<ExecutionSearchResult> {
<<<<<<< HEAD
      const queryLower = query.toLowerCase();
      const limit = options?.limit || 20;

      const records = await readRecords({
        limit: limit + 1,
        filter: (r) => {
          const searchable = [
            r.executionId,
            r.workflowId,
            r.workflowName,
            r.error || '',
            r.triggeredBy || '',
            ...(r.metadata ? Object.values(r.metadata).map(String) : []),
          ].join(' ').toLowerCase();

          const matchesQuery = searchable.includes(queryLower);
          const matchesStatus = !options?.status || r.status === options.status;
          return matchesQuery && matchesStatus;
        }
      });

=======
      let records = await readAllRecords();
      const queryLower = query.toLowerCase();

      records = records.filter((r) => {
        const searchable = [
          r.executionId,
          r.workflowId,
          r.workflowName,
          r.error || '',
          r.triggeredBy || '',
          ...(r.metadata ? Object.values(r.metadata).map(String) : []),
        ].join(' ').toLowerCase();

        const matchesQuery = searchable.includes(queryLower);
        const matchesStatus = !options?.status || r.status === options.status;
        return matchesQuery && matchesStatus;
      });

      records.sort((a, b) => parseStartedAt(b).localeCompare(parseStartedAt(a)));

      const limit = options?.limit || 20;
>>>>>>> origin/main
      const hasMore = records.length > limit;
      const sliced = records.slice(0, limit);

      return { records: sliced, total: records.length, hasMore };
    },

    async getMetadata(id: string): Promise<ExecutionMetadata | undefined> {
      const record = await this.get(id);
      if (!record || !record.metadata) return undefined;
      return record.metadata as unknown as ExecutionMetadata;
    },

    async getLatest(status?: string): Promise<ExecutionRecord | undefined> {
<<<<<<< HEAD
      const records = await readRecords({
        limit: 1,
        filter: (r) => !status || r.status === status
      });
=======
      let records = await readAllRecords();
      if (status) {
        records = records.filter((r) => r.status === status);
      }
      records.sort((a, b) => parseStartedAt(b).localeCompare(parseStartedAt(a)));
>>>>>>> origin/main
      return records[0];
    },

    async getRecent(limit = 10): Promise<ExecutionRecord[]> {
<<<<<<< HEAD
      return readRecords({ limit });
=======
      let records = await readAllRecords();
      records.sort((a, b) => parseStartedAt(b).localeCompare(parseStartedAt(a)));
      return records.slice(0, limit);
>>>>>>> origin/main
    },
  };
}
