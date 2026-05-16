import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { computeInstructionHash as sharedComputeInstructionHash } from '@vectahub/doc-task-contract-core';
import { getVectaHubHome } from '../cli/adapter.js';
import type { DocTaskFailureKind, DocTaskRunStatus } from './docTaskState.js';
import type { AgentTaskRunContractSummary } from './docTaskContract.js';

export interface DocTaskRunRecord {
  runId: string;
  batchRunId?: string;
  taskId: string;
  taskLabel: string;
  docPath?: string;
  agentCli: string;
  status: DocTaskRunStatus;
  instructionHash?: string;
  failureKind?: DocTaskFailureKind;
  errorMessage?: string;
  command?: string;
  traceId?: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  durationMs?: number;
  gitChanges?: {
    changedFileCount: number;
    changedFiles: string[];
    shortStat?: string;
  };
  outputSummary?: string;
  outputTruncated?: boolean;
  agentTaskContract?: AgentTaskRunContractSummary;
  verification?: {
    ok: boolean;
    totalCommands: number;
    passedCommands: number;
    failedCommands: number;
    failedCommandSummary?: string;
  };
  confirmationSource?: 'preflight' | 'post-execution';
  unclosedExecution?: boolean;
  retryOfRunId?: string;
}

export interface DocTaskBatchRunRecord {
  batchRunId: string;
  docPath?: string;
  agentCli: string;
  traceId?: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface StartRunInput {
  runId: string;
  batchRunId?: string;
  taskId: string;
  taskLabel: string;
  docPath?: string;
  agentCli: string;
  status?: DocTaskRunStatus;
  command?: string;
  traceId?: string;
  agentTaskContract?: AgentTaskRunContractSummary;
  retryOfRunId?: string;
}

export interface StartBatchInput {
  batchRunId: string;
  docPath?: string;
  agentCli: string;
  traceId?: string;
  totalCount: number;
}

export interface ListRunsOptions {
  limit?: number;
}

export interface SaveRecoveryRecordInput {
  recoveryRunId: string;
  sourceRunId: string;
  taskId: string;
  decision: {
    kind: string;
    mode: string;
    reason: string;
    summary: string;
    suggestedActions: string[];
    needsNewTrace: boolean;
    canReusePreviousCommand: boolean;
  };
  sourceTraceId?: string;
  recoveryTraceId?: string;
  status: 'planned' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  retryOfRunId?: string;
}

export interface DocTaskRunStore {
  beginBatchWrites(): void;
  flushBatchWrites(): Promise<void>;
  endBatchWrites(): Promise<void>;
  startBatch(input: StartBatchInput): Promise<DocTaskBatchRunRecord>;
  updateBatch(record: DocTaskBatchRunRecord): Promise<void>;
  startRun(input: StartRunInput): Promise<DocTaskRunRecord>;
  updateRun(record: DocTaskRunRecord): Promise<void>;
  saveRecoveryRecord(record: SaveRecoveryRecordInput): Promise<void>;
  listRecoveryRecords(limit?: number): Promise<SaveRecoveryRecordInput[]>;
  getLatestByTaskId(taskId: string): Promise<DocTaskRunRecord | undefined>;
  getLatestMap(): Promise<Map<string, DocTaskRunRecord>>;
  listRuns(options?: ListRunsOptions): Promise<DocTaskRunRecord[]>;
}

export interface InstructionHashContract {
  taskId: string;
  label: string;
  docExcerpt: string;
  tool?: string;
  allowedFiles?: string[];
  forbiddenFiles?: string[];
  globalConfigDigest?: string;
}

const MAX_ERROR_MESSAGE = 1000;
const MAX_OUTPUT_SUMMARY = 2000;
const MAX_CHANGED_FILES = 100;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_LATEST_CACHE = 200;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;
const RECENT_DAYS = 7;

/**
 * Compute a stable SHA-256 hash of the task instruction.
 * Mirrors src/commands/agent-task-contract.ts computeInstructionHash exactly.
 */
export function computeInstructionHash(
  contract: InstructionHashContract,
): string {
  return sharedComputeInstructionHash(contract);
}

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toDatePart(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function trimText(value: string | undefined, max: number): [string | undefined, boolean] {
  if (!value || value.length <= max) {
    return [value, false];
  }
  return [value.slice(0, max), true];
}

function sanitizeRunRecord(input: DocTaskRunRecord): DocTaskRunRecord {
  const next: DocTaskRunRecord = { ...input };
  let truncated = input.outputTruncated === true;

  const [errorMessage, errorTrimmed] = trimText(next.errorMessage, MAX_ERROR_MESSAGE);
  next.errorMessage = errorMessage;
  truncated = truncated || errorTrimmed;

  const [outputSummary, outputTrimmed] = trimText(next.outputSummary, MAX_OUTPUT_SUMMARY);
  next.outputSummary = outputSummary;
  truncated = truncated || outputTrimmed;

  if (next.gitChanges) {
    const changedFiles = next.gitChanges.changedFiles.slice(0, MAX_CHANGED_FILES).map(file => file.slice(0, 512));
    if (changedFiles.length < next.gitChanges.changedFiles.length) {
      truncated = true;
    }
    next.gitChanges = {
      ...next.gitChanges,
      changedFileCount: Math.min(next.gitChanges.changedFileCount, changedFiles.length),
      changedFiles,
      shortStat: next.gitChanges.shortStat?.slice(0, 512)
    };
  }

  const enforceSize = () => Buffer.byteLength(JSON.stringify(next), 'utf8');
  while (enforceSize() > MAX_RECORD_BYTES) {
    truncated = true;
    if (next.outputSummary && next.outputSummary.length > 256) {
      next.outputSummary = next.outputSummary.slice(0, Math.max(256, Math.floor(next.outputSummary.length * 0.7)));
      continue;
    }
    if (next.errorMessage && next.errorMessage.length > 200) {
      next.errorMessage = next.errorMessage.slice(0, Math.max(200, Math.floor(next.errorMessage.length * 0.7)));
      continue;
    }
    if (next.gitChanges && next.gitChanges.changedFiles.length > 10) {
      next.gitChanges.changedFiles = next.gitChanges.changedFiles.slice(0, Math.max(10, Math.floor(next.gitChanges.changedFiles.length * 0.7)));
      next.gitChanges.changedFileCount = Math.min(next.gitChanges.changedFileCount, next.gitChanges.changedFiles.length);
      continue;
    }
    break;
  }

  if (truncated) {
    next.outputTruncated = true;
  }
  return next;
}

function sanitizeLatestMap(map: Map<string, DocTaskRunRecord>): Map<string, DocTaskRunRecord> {
  if (map.size <= MAX_LATEST_CACHE) {
    return map;
  }
  const sorted = [...map.entries()].sort((a, b) => {
    const ta = Date.parse(a[1].updatedAt) || 0;
    const tb = Date.parse(b[1].updatedAt) || 0;
    return tb - ta;
  });
  return new Map(sorted.slice(0, MAX_LATEST_CACHE));
}

function resolveDir(projectRoot: string): string {
  return path.join(getVectaHubHome(), 'projects', djb2Hash(projectRoot), 'doc-task-runs');
}

export function createDocTaskRunStore(projectRoot: string): DocTaskRunStore {
  const dir = resolveDir(projectRoot);
  const latestPath = path.join(dir, 'latest.json');
  const batchesPath = path.join(dir, 'batches.jsonl');

  let latestCache: Map<string, DocTaskRunRecord> | undefined;
  let writeQueue: Promise<void> = Promise.resolve();
  let latestDirty = false;
  let batchWriteDepth = 0;

  async function ensureDir(): Promise<void> {
    await fsp.mkdir(dir, { recursive: true });
  }

  async function appendJsonl(filePath: string, payload: unknown): Promise<void> {
    await ensureDir();
    await fsp.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  function getRunFilePathByDate(d: Date): string {
    return path.join(dir, `runs-${toDatePart(d)}.jsonl`);
  }

  async function rebuildLatestFromJsonl(): Promise<Map<string, DocTaskRunRecord>> {
    // Scan recent .jsonl run files to rebuild latest.json
    const rebuilt = new Map<string, DocTaskRunRecord>();
    for (let i = 0; i < RECENT_DAYS; i++) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - i);
      const filePath = getRunFilePathByDate(day);
      if (!fs.existsSync(filePath)) continue;
      try {
        const content = await fsp.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const rec = JSON.parse(line) as DocTaskRunRecord;
            const existing = rebuilt.get(rec.taskId);
            if (!existing || new Date(rec.updatedAt) > new Date(existing.updatedAt)) {
              rebuilt.set(rec.taskId, rec);
            }
          } catch { /* skip malformed line */ }
        }
      } catch { /* skip unreadable file */ }
    }
    return rebuilt;
  }

  async function loadLatestMap(): Promise<Map<string, DocTaskRunRecord>> {
    if (latestCache) {
      return new Map(latestCache);
    }
    try {
      const raw = await fsp.readFile(latestPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, DocTaskRunRecord>;
      const map = new Map<string, DocTaskRunRecord>(Object.entries(parsed ?? {}));
      latestCache = sanitizeLatestMap(map);
      return new Map(latestCache);
    } catch {
      // latest.json missing or corrupted — attempt rebuild from .jsonl
      const rebuilt = await rebuildLatestFromJsonl();
      latestCache = sanitizeLatestMap(rebuilt);
      return new Map(latestCache);
    }
  }

  async function saveLatestMap(map: Map<string, DocTaskRunRecord>): Promise<void> {
    const sanitized = sanitizeLatestMap(map);
    await ensureDir();
    const tmpPath = `${latestPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const asObject = Object.fromEntries(sanitized.entries());
    await fsp.writeFile(tmpPath, JSON.stringify(asObject, null, 2), 'utf8');
    await fsp.rename(tmpPath, latestPath);
    latestCache = new Map(sanitized);
  }

  async function updateLatestRecord(record: DocTaskRunRecord): Promise<void> {
    const latest = await loadLatestMap();
    latest.set(record.taskId, record);
    latestCache = sanitizeLatestMap(latest);
    latestDirty = true;
    if (batchWriteDepth === 0) {
      await flushLatestMap();
    }
  }

  async function flushLatestMap(): Promise<void> {
    if (!latestDirty) {
      return;
    }
    await saveLatestMap(latestCache ?? new Map());
    latestDirty = false;
  }

  async function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(operation, operation);
    writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  function clampLimit(limit?: number): number {
    if (typeof limit !== 'number' || Number.isNaN(limit)) {
      return DEFAULT_LIST_LIMIT;
    }
    return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(limit)));
  }

  async function readTailRuns(filePath: string, limit: number): Promise<DocTaskRunRecord[]> {
    const tail: DocTaskRunRecord[] = [];
    if (!fs.existsSync(filePath)) {
      return tail;
    }
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = (await import('readline')).createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as DocTaskRunRecord;
        tail.push(parsed);
        if (tail.length > limit) {
          tail.shift();
        }
      } catch {
        // ignore malformed line
      }
    }
    return tail.reverse();
  }

  return {
    beginBatchWrites(): void {
      batchWriteDepth += 1;
    },

    async flushBatchWrites(): Promise<void> {
      await enqueueWrite(() => flushLatestMap());
    },

    async endBatchWrites(): Promise<void> {
      if (batchWriteDepth > 0) {
        batchWriteDepth -= 1;
      }
      if (batchWriteDepth === 0) {
        await enqueueWrite(() => flushLatestMap());
      }
    },

    async startBatch(input: StartBatchInput): Promise<DocTaskBatchRunRecord> {
      const now = nowIso();
      const record: DocTaskBatchRunRecord = {
        batchRunId: input.batchRunId,
        docPath: input.docPath,
        agentCli: input.agentCli,
        traceId: input.traceId,
        status: 'running',
        totalCount: input.totalCount,
        completedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        startedAt: now,
        updatedAt: now
      };
      await enqueueWrite(() => appendJsonl(batchesPath, record));
      return record;
    },

    async updateBatch(record: DocTaskBatchRunRecord): Promise<void> {
      await enqueueWrite(() => appendJsonl(batchesPath, { ...record, updatedAt: record.updatedAt || nowIso() }));
    },

    async startRun(input: StartRunInput): Promise<DocTaskRunRecord> {
      const now = nowIso();
      const record = sanitizeRunRecord({
        runId: input.runId,
        batchRunId: input.batchRunId,
        taskId: input.taskId,
        taskLabel: input.taskLabel,
        docPath: input.docPath,
        agentCli: input.agentCli,
        status: input.status ?? 'ready',
        command: input.command,
        traceId: input.traceId,
        agentTaskContract: input.agentTaskContract,
        retryOfRunId: input.retryOfRunId,
        startedAt: now,
        updatedAt: now
      });
      await this.updateRun(record);
      return record;
    },

    async updateRun(record: DocTaskRunRecord): Promise<void> {
      const sanitized = sanitizeRunRecord(record);
      await enqueueWrite(async () => {
        await appendJsonl(getRunFilePathByDate(new Date()), sanitized);
        await updateLatestRecord(sanitized);
      });
    },

    async getLatestByTaskId(taskId: string): Promise<DocTaskRunRecord | undefined> {
      const latest = await loadLatestMap();
      return latest.get(taskId);
    },

    async getLatestMap(): Promise<Map<string, DocTaskRunRecord>> {
      return loadLatestMap();
    },

    async listRuns(options?: ListRunsOptions): Promise<DocTaskRunRecord[]> {
      const limit = clampLimit(options?.limit);
      const all: DocTaskRunRecord[] = [];
      for (let i = 0; i < RECENT_DAYS && all.length < limit; i++) {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() - i);
        const filePath = getRunFilePathByDate(day);
        const remains = limit - all.length;
        if (remains <= 0) {
          break;
        }
        const rows = await readTailRuns(filePath, remains);
        all.push(...rows.slice(0, remains));
      }
      return all.slice(0, limit);
    },

    async saveRecoveryRecord(record: SaveRecoveryRecordInput): Promise<void> {
      const recoveryPath = path.join(dir, `recovery-${toDatePart(new Date())}.jsonl`);
      await enqueueWrite(() => appendJsonl(recoveryPath, record));
    },

    async listRecoveryRecords(limit?: number): Promise<SaveRecoveryRecordInput[]> {
      const effectiveLimit = clampLimit(limit);
      const all: SaveRecoveryRecordInput[] = [];
      for (let i = 0; i < RECENT_DAYS && all.length < effectiveLimit; i++) {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() - i);
        const recoveryPath = path.join(dir, `recovery-${toDatePart(day)}.jsonl`);
        if (!fs.existsSync(recoveryPath)) continue;
        try {
          const content = await fsp.readFile(recoveryPath, 'utf8');
          const lines = content.split('\n').filter(Boolean);
          for (const line of lines) {
            if (all.length >= effectiveLimit) break;
            try {
              all.push(JSON.parse(line) as SaveRecoveryRecordInput);
            } catch { /* skip malformed line */ }
          }
        } catch { /* skip unreadable file */ }
      }
      return all.slice(0, effectiveLimit);
    }
  };
}
