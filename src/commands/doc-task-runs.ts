import { Command } from 'commander';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { djb2Hash, getVectaHubPath } from '../utils/paths.js';
import type { DocTaskFailureKind, DocTaskRunStatus } from '../types/doc-task.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const RECENT_DAYS = 7;

interface RunFilters {
  status?: DocTaskRunStatus;
  failureKind?: DocTaskFailureKind;
}

interface ListOptions extends RunFilters {
  project?: string;
  limit?: string;
  json?: boolean;
}

interface ShowOptions {
  project?: string;
  json?: boolean;
}

interface LatestOptions {
  project?: string;
  json?: boolean;
}

export interface DocTaskRunRecord {
  runId: string;
  taskId?: string;
  taskLabel?: string;
  status?: DocTaskRunStatus;
  failureKind?: DocTaskFailureKind;
  traceId?: string;
  startedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

function clampLimit(raw?: string): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function getStoreDir(projectPath?: string): string {
  const projectRoot = resolve(projectPath || process.cwd());
  const projectHash = djb2Hash(projectRoot);
  return getVectaHubPath('projects', projectHash, 'doc-task-runs');
}

function toDateFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `runs-${year}-${month}-${day}.jsonl`;
}

function buildRecentUtcDateSet(days: number): Set<string> {
  const result = new Set<string>();
  const now = new Date();
  const utcBase = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  for (let i = 0; i < days; i++) {
    const current = new Date(utcBase);
    current.setUTCDate(utcBase.getUTCDate() - i);
    result.add(current.toISOString().slice(0, 10));
  }
  return result;
}

function buildRecentLocalDateSet(days: number): Set<string> {
  const result = new Set<string>();
  const now = new Date();
  const localBase = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < days; i++) {
    const current = new Date(localBase);
    current.setDate(localBase.getDate() - i);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    result.add(`${year}-${month}-${day}`);
  }
  return result;
}

function isWithinRecentDays(fileName: string, recentDateSet: Set<string>): boolean {
  const match = fileName.match(/^runs-(\d{4}-\d{2}-\d{2})\.jsonl$/);
  if (!match) return false;
  return recentDateSet.has(match[1]);
}

function getRecentRunFiles(storeDir: string, days = RECENT_DAYS): string[] {
  const recentDateSet = new Set<string>([
    ...buildRecentUtcDateSet(days),
    ...buildRecentLocalDateSet(days),
  ]);
  try {
    return readdirSync(storeDir)
      .filter((name) => isWithinRecentDays(name, recentDateSet))
      .sort()
      .reverse()
      .map((name) => resolve(storeDir, name));
  } catch {
    return [];
  }
}

function parseJsonLine(line: string): DocTaskRunRecord | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as DocTaskRunRecord;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.runId !== 'string') {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function matchesFilters(run: DocTaskRunRecord, filters: RunFilters): boolean {
  if (filters.status && run.status !== filters.status) return false;
  if (filters.failureKind && run.failureKind !== filters.failureKind) return false;
  return true;
}

function readRunsFromFile(filePath: string, filters: RunFilters, targetLimit: number): DocTaskRunRecord[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const runs: DocTaskRunRecord[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    const run = parseJsonLine(lines[i]);
    if (!run) continue;
    if (!matchesFilters(run, filters)) continue;
    runs.push(run);
    if (runs.length >= targetLimit) break;
  }

  return runs;
}

export function listRecentRuns(options: ListOptions): { runs: DocTaskRunRecord[]; hasMore: boolean } {
  const limit = clampLimit(options.limit);
  const storeDir = getStoreDir(options.project);
  if (!existsSync(storeDir)) {
    return { runs: [], hasMore: false };
  }

  const filters: RunFilters = {
    status: options.status,
    failureKind: options.failureKind,
  };

  const files = getRecentRunFiles(storeDir, RECENT_DAYS);
  const collected: DocTaskRunRecord[] = [];
  const readTarget = Math.min(limit + 1, MAX_LIMIT + 1);

  for (const file of files) {
    if (collected.length >= readTarget) break;
    const remaining = readTarget - collected.length;
    const runs = readRunsFromFile(file, filters, remaining);
    if (runs.length > 0) {
      collected.push(...runs);
    }
  }

  const hasMore = collected.length > limit;
  const runs = hasMore ? collected.slice(0, limit) : collected;
  return { runs, hasMore };
}

export function readLatestRuns(project?: string): DocTaskRunRecord[] {
  const storeDir = getStoreDir(project);
  const latestFile = resolve(storeDir, 'latest.json');
  if (!existsSync(latestFile)) return [];

  try {
    const parsed = JSON.parse(readFileSync(latestFile, 'utf-8')) as unknown;
    if (Array.isArray(parsed)) return parsed as DocTaskRunRecord[];
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, DocTaskRunRecord>);
    }
  } catch {
    return [];
  }

  return [];
}

export function findRunById(runId: string, project?: string): DocTaskRunRecord | undefined {
  const storeDir = getStoreDir(project);
  if (!existsSync(storeDir)) return undefined;

  const files = getRecentRunFiles(storeDir, RECENT_DAYS);
  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const run = parseJsonLine(lines[i]);
      if (run?.runId === runId) {
        return run;
      }
    }
  }
  return undefined;
}

function printListResult(result: { runs: DocTaskRunRecord[]; hasMore: boolean }, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify({ ok: true, runs: result.runs, hasMore: result.hasMore }));
    return;
  }
  if (result.runs.length === 0) {
    console.log('未找到运行记录');
    return;
  }
  console.log(`共 ${result.runs.length} 条运行记录${result.hasMore ? '（已截断）' : ''}`);
  for (const run of result.runs) {
    console.log(`${run.runId} ${run.status || '-'} ${run.taskId || '-'} ${run.updatedAt || run.startedAt || '-'}`);
  }
}

function printShowResult(run: DocTaskRunRecord | undefined, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify({ ok: true, run }));
    return;
  }
  if (!run) {
    console.log('未找到运行记录');
    return;
  }
  console.log(`${run.runId} ${run.status || '-'} ${run.taskId || '-'} ${run.updatedAt || run.startedAt || '-'}`);
}

function printLatestResult(tasks: DocTaskRunRecord[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify({ ok: true, tasks }));
    return;
  }
  if (tasks.length === 0) {
    console.log('暂无最新任务摘要');
    return;
  }
  console.log(`共 ${tasks.length} 条任务最新摘要`);
  for (const task of tasks) {
    console.log(`${task.taskId || '-'} ${task.runId} ${task.status || '-'} ${task.updatedAt || task.startedAt || '-'}`);
  }
}

export const docTaskRunsCmd = new Command('doc-task-runs')
  .description('查询文档任务运行记录');

docTaskRunsCmd
  .command('list')
  .description('查询最近运行记录（默认最近 7 天）')
  .option('--project <path>', '项目路径，默认当前目录')
  .option('--limit <n>', `返回数量，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}`)
  .option('--status <status>', '按状态过滤')
  .option('--failure-kind <kind>', '按失败类型过滤')
  .option('--json', '输出 JSON')
  .action((options: ListOptions) => {
    const result = listRecentRuns(options);
    printListResult(result, Boolean(options.json));
  });

docTaskRunsCmd
  .command('show')
  .description('按 runId 查询单条运行记录（最近 7 天）')
  .argument('<runId>', '运行记录 ID')
  .option('--project <path>', '项目路径，默认当前目录')
  .option('--json', '输出 JSON')
  .action((runId: string, options: ShowOptions) => {
    const run = findRunById(runId, options.project);
    printShowResult(run, Boolean(options.json));
  });

docTaskRunsCmd
  .command('latest')
  .description('读取 latest.json 的任务最新摘要')
  .option('--project <path>', '项目路径，默认当前目录')
  .option('--json', '输出 JSON')
  .action((options: LatestOptions) => {
    const tasks = readLatestRuns(options.project);
    printLatestResult(tasks, Boolean(options.json));
  });
