import { createRootTraceContext, createSpanId } from './context.js';
import { TraceContext, TraceError, TraceSource } from './types.js';
import { writeTraceSpan } from './writer.js';

export interface SpanHandle {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  end(attributes?: Record<string, unknown>): Promise<void>;
  fail(error: unknown, attributes?: Record<string, unknown>): Promise<void>;
}

function toErrorRecord(error: unknown): TraceError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) };
}

export function startSpan(
  name: string,
  options?: {
    context?: TraceContext;
    parentSpanId?: string;
    source?: TraceSource;
    attributes?: Record<string, unknown>;
  },
): SpanHandle {
  const context = options?.context || createRootTraceContext();
  const startTime = new Date().toISOString();
  const startNs = process.hrtime.bigint();
  const spanId = createSpanId();
  const traceId = context.traceId;
  const parentSpanId = options?.parentSpanId ?? context.parentSpanId;
  const source = options?.source || context.source || 'vscode';
  let closed = false;

  const finish = async (status: 'completed' | 'failed', error?: unknown, attributes?: Record<string, unknown>) => {
    if (closed) return;
    closed = true;

    const endTime = new Date().toISOString();
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    await writeTraceSpan({
      traceId,
      spanId,
      parentSpanId,
      name,
      source,
      status,
      startTime,
      endTime,
      durationMs,
      attributes: {
        ...(options?.attributes || {}),
        ...(attributes || {}),
      },
      error: error ? toErrorRecord(error) : undefined,
    });
  };

  return {
    traceId,
    spanId,
    parentSpanId,
    end: async (attributes?: Record<string, unknown>) => finish('completed', undefined, attributes),
    fail: async (error: unknown, attributes?: Record<string, unknown>) => finish('failed', error, attributes),
  };
}

export async function withSpan<T>(
  name: string,
  fn: (span: SpanHandle) => Promise<T>,
  options?: Parameters<typeof startSpan>[1],
): Promise<T> {
  const span = startSpan(name, options);
  try {
    const result = await fn(span);
    await span.end();
    return result;
  } catch (error) {
    await span.fail(error);
    throw error;
  }
}
