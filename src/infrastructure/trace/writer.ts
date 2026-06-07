import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getVectaHubPath, getProjectLogDir } from '../paths/index.js';
import { Redactor } from '../../security-protocol/redactor.js';
import { TraceSpanRecord } from './types.js';
import { getLogger } from '../logger/index.js';

const redactor = new Redactor({ skipKeys: ['traceId', 'spanId', 'parentSpanId'] });

/**
 * Trace writer 的依赖注入接口
 * 通过 projectRoot 控制日志写入全局目录还是项目级目录
 */
export interface TraceWriterDeps {
  /** 项目根目录，设置后 trace 日志写入 {projectRoot}/.vectahub/logs/traces/ */
  projectRoot?: string;
}

/**
 * 根据依赖计算 trace 文件路径
 * 有 projectRoot 时写入项目级目录，否则写入全局目录
 */
function getTraceFilePath(deps: TraceWriterDeps, date: Date): string {
  const datePart = date.toISOString().slice(0, 10);
  if (deps.projectRoot) {
    return getProjectLogDir(deps.projectRoot, 'traces', `${datePart}.jsonl`);
  }
  return getVectaHubPath('logs', 'traces', `${datePart}.jsonl`);
}

/**
 * 写入 trace span 记录
 * @param record - trace span 记录
 * @param deps - 依赖注入，可选 projectRoot 控制写入位置
 */
export async function writeTraceSpan(record: TraceSpanRecord, deps: TraceWriterDeps = {}): Promise<void> {
  try {
    const file = getTraceFilePath(deps, new Date(record.endTime));
    await mkdir(dirname(file), { recursive: true });
    const redacted = redactor.redactObject(record as unknown as Record<string, unknown>) as unknown as TraceSpanRecord;
    await appendFile(file, `${JSON.stringify(redacted)}\n`, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger('trace-writer').debug({ error: message }, 'Trace span write failed, skipping');
  }
}
