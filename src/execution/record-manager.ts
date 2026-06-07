import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import type { ExecutionRecord, ExecutionFilter, ExecutionSearchResult, ExecutionMetadata } from './types.js';
import { getVectaHubPath, getProjectExecutionDir } from '../infrastructure/paths/index.js';
import { parseStartedAt, toDatePartitionKey } from './utils.js';

interface LoggerLike {
  warn(message: string): void;
}

const noopLogger: LoggerLike = { warn() {} };

/**
 * RecordManager 的依赖注入接口
 */
export interface RecordManagerDeps {
  /** 日志记录器，用于报告格式错误的 JSONL 行 */
  logger?: LoggerLike;
  /** 项目根目录，设置后执行记录写入 {projectRoot}/.vectahub/executions/ */
  projectRoot?: string;
}

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

const DEFAULT_LIST_LIMIT = 50;

/**
 * Creates a record manager backed by JSONL files on the filesystem.
 *
 * Records are partitioned by date into `YYYYMMDD.jsonl` files.
 * Supports listing, filtering, searching, and metadata retrieval.
 *
 * @param baseDir - Base directory for record storage. Defaults to `<VectaHub>/executions`.
 * @param deps - Optional dependencies. Pass `{ logger }` to receive warnings for malformed lines,
 *               `{ projectRoot }` to write records to `{projectRoot}/.vectahub/executions/` instead.
 * @returns A {@link RecordManager} instance
 */
export function createRecordManager(baseDir?: string, deps?: RecordManagerDeps): RecordManager {
  const dir = baseDir || (deps?.projectRoot ? getProjectExecutionDir(deps.projectRoot) : getVectaHubPath('executions'));
  const logger = deps?.logger ?? noopLogger;

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

          if (!options.filter || options.filter(record)) {
            records.push(record);
            if (records.length >= targetLimit) break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Skipping malformed JSONL line in ${file}: ${message}`);
        }
      }
    }

    return records;
  }

  return {
    async save(record: ExecutionRecord): Promise<void> {
      await ensureDir();
      const startedAtStr = parseStartedAt(record);
      const dateStr = toDatePartitionKey(startedAtStr);
      const filePath = getDayFile(dir, dateStr);
      const line = JSON.stringify(record) + '\n';
      try {
        const existing = await readFile(filePath, 'utf-8');
        await writeFile(filePath, existing + line, 'utf-8');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Append write failed for ${filePath}, falling back to overwrite: ${message}`);
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
      const limit = filter?.limit || DEFAULT_LIST_LIMIT;
      
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
      for (const r of allRecords) {
        const dateStr = toDatePartitionKey(parseStartedAt(r));
        if (!grouped.has(dateStr)) grouped.set(dateStr, []);
        grouped.get(dateStr)!.push(r);
      }

      await ensureDir();
      const files = await readdir(dir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        await rm(join(dir, file), { force: true });
      }

      for (const [dateStr, recs] of grouped) {
        const content = recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
        await writeFile(join(dir, `${dateStr}.jsonl`), content, 'utf-8');
      }

      return true;
    },

    async search(query: string, options?: { limit?: number; status?: string }): Promise<ExecutionSearchResult> {
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
      const records = await readRecords({
        limit: 1,
        filter: (r) => !status || r.status === status
      });
      return records[0];
    },

    async getRecent(limit = 10): Promise<ExecutionRecord[]> {
      return readRecords({ limit });
    },
  };
}
