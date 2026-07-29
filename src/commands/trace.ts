import { Command } from 'commander';
import { format } from 'node:util';
import { TraceSpanRecord } from '../infrastructure/trace/types.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface TraceSummary {
  traceId: string;
  spanCount: number;
  failedCount: number;
  durationMs: number;
  totalSpanDurationMs: number;
  lastSeen: string;
}

interface TraceCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  json(payload: unknown, options?: { space?: number }): void;
}

function createTraceCommandOutput(): TraceCommandOutput {
  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${format(message, ...optionalParams)}\n`);
    },
    json(payload: unknown, options?: { space?: number }): void {
      process.stdout.write(`${JSON.stringify(payload, null, options?.space ?? 2)}\n`);
    },
  };
}

function buildRecentUtcDateSet(maxDays: number): Set<string> {
  const result = new Set<string>();
  const now = new Date();
  const utcBase = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  for (let i = 0; i < maxDays; i++) {
    const current = new Date(utcBase);
    current.setUTCDate(utcBase.getUTCDate() - i);
    result.add(current.toISOString().slice(0, 10));
  }
  return result;
}

function buildRecentLocalDateSet(maxDays: number): Set<string> {
  const result = new Set<string>();
  const now = new Date();
  const localBase = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < maxDays; i++) {
    const current = new Date(localBase);
    current.setDate(localBase.getDate() - i);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    result.add(`${year}-${month}-${day}`);
  }
  return result;
}

function isFileWithinRecentDays(fileName: string, recentDateSet: Set<string>): boolean {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})(?:-traces)?\.jsonl$/);
  if (!match) return false;
  return recentDateSet.has(match[1]);
}

async function readSpans(env: IEnvironmentService, options?: {
  traceId?: string;
  maxDays?: number;
  maxSpans?: number;
  scanAllFiles?: boolean;
}): Promise<TraceSpanRecord[]> {
  const dir = env.getPath('logs', 'traces');
  let files: string[];
  const maxDays = options?.maxDays ?? 14;
  const recentDateSet = options?.scanAllFiles
    ? null
    : new Set<string>([
      ...buildRecentUtcDateSet(maxDays),
      ...buildRecentLocalDateSet(maxDays),
    ]);
  try {
    files = env.readDir(dir)
      .filter((f) => f.endsWith('.jsonl') && (!recentDateSet || isFileWithinRecentDays(f, recentDateSet)))
      .sort()
      .reverse();
  } catch {
    return [];
  }

  const result: TraceSpanRecord[] = [];
  const targetTraceId = options?.traceId;
  const maxSpans = options?.maxSpans ?? Number.MAX_SAFE_INTEGER;

  for (const file of files) {
    const fullPath = env.getPath('logs', 'traces', file);

    try {
      for await (const line of env.readLines(fullPath)) {
        const text = line.trim();
        if (!text) continue;
        try {
          const span = JSON.parse(text) as TraceSpanRecord;
          if (!targetTraceId || span.traceId === targetTraceId) {
            result.push(span);
            if (result.length >= maxSpans) {
              return result;
            }
          }
        } catch {
          // ignore malformed line
        }
      }
    } catch {
      // ignore error reading file
    }
  }

  return result;
}

function summarizeTraces(spans: TraceSpanRecord[]): TraceSummary[] {
  const map = new Map<string, TraceSpanRecord[]>();
  for (const span of spans) {
    const list = map.get(span.traceId) || [];
    list.push(span);
    map.set(span.traceId, list);
  }

  const result: TraceSummary[] = [];
  for (const [traceId, records] of map.entries()) {
    const sorted = [...records].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const spanCount = sorted.length;
    const failedCount = sorted.filter((s) => s.status === 'failed').length;
    const startAt = new Date(sorted[0].startTime).getTime();
    const endAt = Math.max(...sorted.map((s) => new Date(s.endTime || s.startTime).getTime()));
    const durationMs = Math.max(0, Math.round(endAt - startAt));
    const totalSpanDurationMs = Math.round(sorted.reduce((acc, s) => acc + (s.durationMs || 0), 0));
    const lastSeen = sorted[sorted.length - 1]?.endTime || sorted[sorted.length - 1]?.startTime;
    result.push({ traceId, spanCount, failedCount, durationMs, totalSpanDurationMs, lastSeen });
  }

  return result.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

function formatTree(spans: TraceSpanRecord[]): string {
  const sorted = [...spans].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return sorted
    .map((span) => {
      const status = span.status === 'failed' ? '✗' : '✓';
      const parent = span.parentSpanId ? ` parent=${span.parentSpanId}` : '';
      return `${status} ${span.name} ${Math.round(span.durationMs)}ms${parent}`;
    })
    .join('\n');
}

/**
 * 创建跟踪命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createTraceCmd(context: InfrastructureContext): Command {
  const env = context.environment;
  const output = createTraceCommandOutput();

  const listCmd = new Command('list')
    .description('查看最近 trace 概览')
    .option('--json', '以 JSON 格式输出')
    .option('--limit <n>', '最多返回多少条 trace', '20')
    .action(async (options: { json?: boolean; limit?: string }) => {
      try {
        const limit = Math.max(1, parseInt(options.limit || '20', 10) || 20);
        const spans = await readSpans(env, { maxDays: 14, maxSpans: 20000 });
        const traces = summarizeTraces(spans).slice(0, limit);
        if (options.json) {
          output.json({ ok: true, traces });
          return;
        }

        if (traces.length === 0) {
          output.log('暂无 trace 记录');
          return;
        }

        for (const trace of traces) {
          output.log(
            `${trace.traceId} spans=${trace.spanCount} failed=${trace.failedCount} duration=${trace.durationMs}ms totalSpan=${trace.totalSpanDurationMs}ms lastSeen=${trace.lastSeen}`,
          );
        }
      } catch (error) {
        throw new VectaHubError(`Trace list failed: ${error instanceof Error ? error.message : String(error)}`, ErrorType.RUNTIME, error);
      }
    });

  const showCmd = new Command('show')
    .description('查看指定 trace 的 spans')
    .argument('<traceId>', 'trace id')
    .option('--json', '以 JSON 格式输出')
    .action(async (traceId: string, options: { json?: boolean }) => {
      try {
        const spans = (await readSpans(env, { traceId, maxDays: 14, maxSpans: 5000, scanAllFiles: true })).sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );

        if (options.json) {
          output.json({ ok: true, traceId, spans });
          return;
        }

        if (spans.length === 0) {
          output.log(`未找到 trace: ${traceId}`);
          return;
        }

        output.log(formatTree(spans));
      } catch (error) {
        throw new VectaHubError(`Trace show failed: ${error instanceof Error ? error.message : String(error)}`, ErrorType.RUNTIME, error);
      }
    });

  return new Command('trace').description('查看链路追踪信息').addCommand(listCmd).addCommand(showCmd);
}
