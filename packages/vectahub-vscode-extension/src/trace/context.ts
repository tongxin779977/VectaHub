import { TraceContext } from './types.js';

export function createTraceId(): string {
  return `tr_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

export function createSpanId(): string {
  return `sp_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

export function createRootTraceContext(): TraceContext {
  return { traceId: createTraceId(), source: 'vscode' };
}

export function createCliTraceEnv(context: TraceContext, parentSpanId: string): Record<string, string> {
  return {
    VECTAHUB_TRACE_ID: context.traceId,
    VECTAHUB_PARENT_SPAN_ID: parentSpanId,
    VECTAHUB_TRACE_SOURCE: 'vscode',
  };
}
