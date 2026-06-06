export type TraceSource = 'cli' | 'vscode';

/**
 * 对齐 OpenTelemetry SpanKind
 */
export enum SpanKind {
  INTERNAL = 'INTERNAL',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER',
}

export type TraceSpanStatus = 'completed' | 'failed' | 'unset';

export interface TraceError {
  message: string;
  name?: string;
  stack?: string;
}

export interface TraceSpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  source: TraceSource;
  status: TraceSpanStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  attributes?: Record<string, unknown>;
  error?: TraceError;
}

export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  source?: TraceSource;
}
