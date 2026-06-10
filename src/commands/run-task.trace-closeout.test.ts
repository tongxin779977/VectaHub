import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeTraceSpanMock = vi.hoisted(() => vi.fn());

vi.mock('../infrastructure/trace/writer.js', () => ({
  writeTraceSpan: writeTraceSpanMock,
}));

async function createTestRunTaskCmd() {
  const { createRunTaskCmd } = await import('./run-task.js');
  const { getDefaultContext } = await import('../infrastructure/context.js');
  return createRunTaskCmd(getDefaultContext());
}

describe('runTask trace closeout', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  function getStdoutText(): string {
    return stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
  }

  beforeEach(() => {
    writeTraceSpanMock.mockReset();
    vi.restoreAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('emits cli.run-task.formatJson as a child span on JSON contract preview path', async () => {
    const runTaskCmd = await createTestRunTaskCmd();

    await runTaskCmd.parseAsync([
      '--file', '/tmp/does-not-matter.md',
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

    const payload = getStdoutText();
    expect(payload).toContain('"ok": true');
    expect(payload).toContain('"agentTaskContract"');
  });

  it('emits cli.run-task.formatJson on JSON error path before failing the root span', async () => {
    const runTaskCmd = await createTestRunTaskCmd();

    await expect(runTaskCmd.parseAsync([
      '--file', '/tmp/does-not-matter.md',
      '--task-id', 'TRACE-ERR',
      '--json',
    ], { from: 'user' })).rejects.toThrow('缺少 Agent CLI 工具名称');

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

    const payload = getStdoutText();
    expect(payload).toContain('"ok": false');
    expect(payload).toContain('"code": "CLI_ERROR"');
    expect(payload).toContain('缺少 Agent CLI 工具名称');
  });
});
