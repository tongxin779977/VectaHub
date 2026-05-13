import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { TraceSpanRecord } from './types.js';
import { getVectaHubHome } from '../cli/adapter.js';

function getTraceFilePath(date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10);
  return path.join(getVectaHubHome(), 'logs', 'traces', `${datePart}.jsonl`);
}

export async function writeTraceSpan(record: TraceSpanRecord): Promise<void> {
  try {
    const filePath = getTraceFilePath(new Date(record.endTime));
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // ignore write error
  }
}
