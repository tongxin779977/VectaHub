import { createRootTraceContext, createSpanId, getTraceContextFromEnv } from './context.js';
import { writeTraceSpan } from './writer.js';
import { TraceContext, TraceError, TraceSource } from './types.js';

export interface SpanHandle {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  end(attributes?: Record<string, unknown>): Promise<void>;
  fail(error: unknown, attributes?: Record<string, unknown>): Promise<void>;
}

function toTraceError(error: unknown): TraceError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
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
  }
): SpanHandle {
  const externalContext = options?.context || getTraceContextFromEnv();
  const fallbackContext = createRootTraceContext();
  const context = externalContext || fallbackContext;
  const spanId = createSpanId();
  const traceId = context.traceId;
  const parentSpanId = options?.parentSpanId ?? context.parentSpanId;
  const source = options?.source || context.source || 'cli';
  const startMs = process.hrtime.bigint();
  const startTime = new Date().toISOString();
  let closed = false;

  const close = async (status: 'completed' | 'failed', error?: unknown, attributes?: Record<string, unknown>) => {
    if (closed) return;
    closed = true;
    const endTime = new Date().toISOString();
    const durationMs = Number(process.hrtime.bigint() - startMs) / 1_000_000;
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
      error: error ? toTraceError(error) : undefined,
    });
  };

  return {
    traceId,
    spanId,
    parentSpanId,
    end: async (attributes?: Record<string, unknown>) => close('completed', undefined, attributes),
    fail: async (error: unknown, attributes?: Record<string, unknown>) => close('failed', error, attributes),
  };
}

export async function withSpan<T>(
  name: string,
  fn: (span: SpanHandle) => Promise<T>,
  options?: Parameters<typeof startSpan>[1]
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
