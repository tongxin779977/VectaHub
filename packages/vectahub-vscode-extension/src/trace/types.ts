export type TraceSource = 'cli' | 'vscode';

export type TraceSpanStatus = 'completed' | 'failed';

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
  parentSpanId?: string;
  source?: TraceSource;
}
