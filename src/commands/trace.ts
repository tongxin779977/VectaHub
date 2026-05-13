import { Command } from 'commander';
import { readdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { getVectaHubPath } from '../utils/paths.js';
import { TraceSpanRecord } from '../infrastructure/trace/types.js';

interface TraceSummary {
  traceId: string;
  spanCount: number;
  failedCount: number;
  durationMs: number;
  totalSpanDurationMs: number;
  lastSeen: string;
}

async function readSpans(options?: {
  traceId?: string;
  maxDays?: number;
  maxSpans?: number;
}): Promise<TraceSpanRecord[]> {
  const dir = getVectaHubPath('logs', 'traces');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().reverse();
  } catch {
    return [];
  }

  const result: TraceSpanRecord[] = [];
  const targetTraceId = options?.traceId;
  const maxDays = options?.maxDays ?? 14;
  const maxSpans = options?.maxSpans ?? Number.MAX_SAFE_INTEGER;

  for (const file of files.slice(0, maxDays)) {
    const fullPath = join(dir, file);
    const reader = createInterface({
      input: createReadStream(fullPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of reader) {
      const text = line.trim();
      if (!text) continue;
      try {
        const span = JSON.parse(text) as TraceSpanRecord;
        if (!targetTraceId || span.traceId === targetTraceId) {
          result.push(span);
          if (result.length >= maxSpans) {
            reader.close();
            return result;
          }
        }
      } catch {
        // ignore malformed line
      }
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

const listCmd = new Command('list')
  .description('查看最近 trace 概览')
  .option('--json', '以 JSON 格式输出')
  .option('--limit <n>', '最多返回多少条 trace', '20')
  .action(async (options: { json?: boolean; limit?: string }) => {
    const limit = Math.max(1, parseInt(options.limit || '20', 10) || 20);
    const spans = await readSpans({ maxDays: 14, maxSpans: 20000 });
    const traces = summarizeTraces(spans).slice(0, limit);
    if (options.json) {
      console.log(JSON.stringify({ ok: true, traces }, null, 2));
      return;
    }

    if (traces.length === 0) {
      console.log('暂无 trace 记录');
      return;
    }

    for (const trace of traces) {
      console.log(
        `${trace.traceId} spans=${trace.spanCount} failed=${trace.failedCount} duration=${trace.durationMs}ms totalSpan=${trace.totalSpanDurationMs}ms lastSeen=${trace.lastSeen}`,
      );
    }
  });

const showCmd = new Command('show')
  .description('查看指定 trace 的 spans')
  .argument('<traceId>', 'trace id')
  .option('--json', '以 JSON 格式输出')
  .action(async (traceId: string, options: { json?: boolean }) => {
    const spans = (await readSpans({ traceId, maxDays: 14, maxSpans: 5000 })).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    if (options.json) {
      console.log(JSON.stringify({ ok: true, traceId, spans }, null, 2));
      return;
    }

    if (spans.length === 0) {
      console.log(`未找到 trace: ${traceId}`);
      return;
    }

    console.log(formatTree(spans));
  });

export const traceCmd = new Command('trace').description('查看链路追踪信息').addCommand(listCmd).addCommand(showCmd);
