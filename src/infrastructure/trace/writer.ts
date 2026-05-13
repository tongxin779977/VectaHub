import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getVectaHubPath } from '../../utils/paths.js';
import { TraceSpanRecord } from './types.js';

function getTraceFilePath(date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10);
  return getVectaHubPath('logs', 'traces', `${datePart}.jsonl`);
}

export async function writeTraceSpan(record: TraceSpanRecord): Promise<void> {
  try {
    const file = getTraceFilePath(new Date(record.endTime));
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // trace 落盘失败不能影响主流程
  }
}
