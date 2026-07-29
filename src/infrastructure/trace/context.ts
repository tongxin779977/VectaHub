import { randomBytes } from 'node:crypto';
import { TraceContext } from './types.js';

const TRACE_ID_ENV = 'VECTAHUB_TRACE_ID';
const TRACE_PARENT_SPAN_ENV = 'VECTAHUB_PARENT_SPAN_ID';
const TRACE_SOURCE_ENV = 'VECTAHUB_TRACE_SOURCE';

function randomIdPart(): string {
  return randomBytes(5).toString('hex').slice(0, 10);
}

export function createTraceId(): string {
  return `tr_${Date.now()}_${randomIdPart()}`;
}

export function createSpanId(): string {
  return `sp_${Date.now()}_${randomIdPart()}`;
}

export function getTraceContextFromEnv(env: NodeJS.ProcessEnv = process.env): TraceContext | null {
  const traceId = env[TRACE_ID_ENV];
  if (!traceId) return null;
  const source = env[TRACE_SOURCE_ENV] === 'vscode' ? 'vscode' : 'cli';
  return {
    traceId,
    parentSpanId: env[TRACE_PARENT_SPAN_ENV],
    source,
  };
}

export function createRootTraceContext(): TraceContext {
  return {
    traceId: createTraceId(),
    source: 'cli',
  };
}

export function createChildEnv(context: TraceContext, parentSpanId: string): NodeJS.ProcessEnv {
  return {
    [TRACE_ID_ENV]: context.traceId,
    [TRACE_PARENT_SPAN_ENV]: parentSpanId,
    [TRACE_SOURCE_ENV]: context.source || 'cli',
  };
}
