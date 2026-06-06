import { describe, expect, it, vi } from 'vitest';

const writeTraceSpanMock = vi.hoisted(() => vi.fn());

vi.mock('../src/trace/writer.js', () => ({
  writeTraceSpan: writeTraceSpanMock,
}));

import { createCliTraceEnv, createRootTraceContext } from '../src/trace/context.js';
import { startSpan, withSpan } from '../src/trace/tracer.js';

describe('trace context', () => {
  it('should create cli env with required fields', () => {
    const ctx = createRootTraceContext();
    const env = createCliTraceEnv(ctx, 'sp_test');
    expect(env.VECTAHUB_TRACE_ID).toBe(ctx.traceId);
    expect(env.VECTAHUB_PARENT_SPAN_ID).toBe('sp_test');
    expect(env.VECTAHUB_TRACE_SOURCE).toBe('vscode');
  });
});

describe('trace tracer', () => {
  it('withSpan should emit completed on success', async () => {
    await withSpan('vscode.cli.parseJson', async () => 1, { context: createRootTraceContext() });
    expect(writeTraceSpanMock).toHaveBeenCalled();
    const [record] = writeTraceSpanMock.mock.calls[0];
    expect(record.status).toBe('completed');
  });

  it('startSpan fail should emit failed status', async () => {
    const span = startSpan('vscode.cli.spawnError', { context: createRootTraceContext() });
    await span.fail(new Error('spawn failed'));
    const [record] = writeTraceSpanMock.mock.calls.at(-1);
    expect(record.status).toBe('failed');
    expect(record.error.message).toBe('spawn failed');
  });
});
