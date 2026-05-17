import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeTraceSpanMock = vi.hoisted(() => vi.fn());

vi.mock('../infrastructure/trace/writer.js', () => ({
  writeTraceSpan: writeTraceSpanMock,
}));

import { runTaskCmd } from './run-task.js';

describe('runTask trace closeout', () => {
  beforeEach(() => {
    writeTraceSpanMock.mockReset();
    vi.restoreAllMocks();
  });

  it('emits cli.run-task.formatJson as a child span on JSON contract preview path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runTaskCmd.parseAsync([
      '--task-id', 'TRACE-1',
      '--contract-preview',
      '--json',
    ], { from: 'user' });

    const records = writeTraceSpanMock.mock.calls.map(([record]) => record as {
      name: string;
      spanId: string;
      parentSpanId?: string;
      status: string;
    });
    const rootSpan = records.find((record) => record.name === 'cli.run-task');
    const contractSpan = records.find((record) => record.name === 'cli.run-task.buildAgentTaskContract');
    const formatJsonSpan = records.find((record) => record.name === 'cli.run-task.formatJson');

    expect(rootSpan).toBeDefined();
    expect(contractSpan).toBeDefined();
    expect(formatJsonSpan).toBeDefined();
    expect(contractSpan?.parentSpanId).toBe(rootSpan?.spanId);
    expect(formatJsonSpan?.parentSpanId).toBe(rootSpan?.spanId);
    expect(formatJsonSpan?.status).toBe('completed');

    const payload = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(payload).toContain('"ok": true');
    expect(payload).toContain('"agentTaskContract"');
  });

  it('emits cli.run-task.formatJson on JSON error path before failing the root span', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await runTaskCmd.parseAsync([
      '--task-id', 'TRACE-ERR',
      '--json',
    ], { from: 'user' });

    const records = writeTraceSpanMock.mock.calls.map(([record]) => record as {
      name: string;
      spanId: string;
      parentSpanId?: string;
      status: string;
    });
    const rootSpan = records.find((record) => record.name === 'cli.run-task');
    const formatJsonSpan = records.find((record) => record.name === 'cli.run-task.formatJson');

    expect(rootSpan).toBeDefined();
    expect(rootSpan?.status).toBe('failed');
    expect(formatJsonSpan).toBeDefined();
    expect(formatJsonSpan?.parentSpanId).toBe(rootSpan?.spanId);
    expect(formatJsonSpan?.status).toBe('completed');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const payload = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(payload).toContain('"ok": false');
    expect(payload).toContain('"code": "CLI_ERROR"');
    expect(payload).toContain('缺少 Agent CLI 工具名称');
  });
});
