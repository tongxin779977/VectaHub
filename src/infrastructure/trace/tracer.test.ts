import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startSpan, withSpan } from './tracer.js';

const writeTraceSpanMock = vi.hoisted(() => vi.fn());

vi.mock('./writer.js', () => ({
  writeTraceSpan: writeTraceSpanMock,
}));

describe('tracer', () => {
  beforeEach(() => {
    writeTraceSpanMock.mockReset();
  });

  it('startSpan end should write completed record', async () => {
    const span = startSpan('test.span', { source: 'cli' });
    await span.end({ taskId: '1' });

    expect(writeTraceSpanMock).toHaveBeenCalledTimes(1);
    const [record] = writeTraceSpanMock.mock.calls[0];
    expect(record.name).toBe('test.span');
    expect(record.status).toBe('completed');
    expect(record.attributes.taskId).toBe('1');
  });

  it('withSpan should write failed and rethrow', async () => {
    await expect(withSpan('test.fail', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(writeTraceSpanMock).toHaveBeenCalledTimes(1);
    const [record] = writeTraceSpanMock.mock.calls[0];
    expect(record.status).toBe('failed');
    expect(record.error.message).toBe('boom');
  });

  it('end should be idempotent', async () => {
    const span = startSpan('test.once');
    await span.end();
    await span.end();
    expect(writeTraceSpanMock).toHaveBeenCalledTimes(1);
  });
});
