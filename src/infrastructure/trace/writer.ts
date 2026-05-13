import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getVectaHubPath } from '../../utils/paths.js';
import { Redactor } from '../../security-protocol/redactor.js';
import { TraceSpanRecord } from './types.js';

const redactor = new Redactor();

function getTraceFilePath(date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10);
  return getVectaHubPath('logs', 'traces', `${datePart}.jsonl`);
}

export async function writeTraceSpan(record: TraceSpanRecord): Promise<void> {
  try {
    const file = getTraceFilePath(new Date(record.endTime));
    await mkdir(dirname(file), { recursive: true });
    const redacted = redactor.redactObject(record as unknown as Record<string, unknown>) as unknown as TraceSpanRecord;
    await appendFile(file, `${JSON.stringify(redacted)}\n`, 'utf8');
  } catch {
    // trace 落盘失败不能影响主流程
  }
}
