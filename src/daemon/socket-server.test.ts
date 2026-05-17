import { beforeEach, describe, expect, it, vi } from 'vitest';

const processInputMock = vi.fn();
const createLLMConfigMock = vi.fn();
const auditIntentMatchMock = vi.fn();
const sandboxSetModeMock = vi.fn();
const auditConfigChangeMock = vi.fn();

vi.mock('../nl/orchestrator.js', () => ({
  processInput: processInputMock,
}));

vi.mock('../nl/llm.js', () => ({
  createLLMConfig: createLLMConfigMock,
}));

vi.mock('../sandbox/sandbox.js', () => ({
  createSandboxManager: vi.fn(() => ({
    getConfig: () => ({ mode: 'RELAXED' }),
    setMode: sandboxSetModeMock,
    getStatusSummary: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../skills/executor.js', () => ({
  createSkillExecutor: vi.fn(() => ({})),
}));

vi.mock('../utils/audit.js', () => ({
  audit: {
    intentMatch: auditIntentMatchMock,
    log: vi.fn(),
    cliCommand: vi.fn(),
    configChange: auditConfigChangeMock,
    workflowEnd: vi.fn(),
  },
  getCurrentSessionId: vi.fn(() => 'session-test'),
  AuditEventType: {
    WORKFLOW_START: 'WORKFLOW_START',
    WORKFLOW_END: 'WORKFLOW_END',
    ENV_AUDIT: 'ENV_AUDIT',
  },
}));

describe('SocketServer.executeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes unified llm config to processInput', async () => {
    const llmConfig = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
    };
    createLLMConfigMock.mockReturnValue(llmConfig);
    processInputMock.mockResolvedValue({
      success: true,
      intent: 'RUN_SCRIPT',
      confidence: 0.9,
      taskList: {
        tasks: [{ id: 'task_1', commands: [{ cli: 'git', args: ['status'] }] }],
        warnings: [],
      },
      metadata: {},
      params: {},
    });

    const { SocketServer } = await import('./socket-server.js');
    const server = new SocketServer();
    const result = await (server as any).executeTask('check status');

    expect(processInputMock).toHaveBeenCalledWith('check status', llmConfig);
    expect(result).toContain('Execution delegated to Skill System.');
  });

  it('returns warning for non-executable capability result instead of delegated success', async () => {
    createLLMConfigMock.mockReturnValue(undefined);
    processInputMock.mockResolvedValue({
      success: true,
      intent: 'UNKNOWN',
      confidence: 0,
      taskList: {
        tasks: [],
        warnings: ['clarification required before execution'],
      },
      metadata: {
        fallbackReason: 'goal needs clarification',
      },
      params: {},
    });

    const { SocketServer } = await import('./socket-server.js');
    const server = new SocketServer();
    const result = await (server as any).executeTask('do something ambiguous');

    expect(result).toBe('No executable plan: clarification required before execution');
    expect(result).not.toContain('Execution delegated to Skill System.');
  });

  it('rejects invalid setMode value and does not call sandbox.setMode', async () => {
    const { SocketServer } = await import('./socket-server.js');
    const server = new SocketServer();
    const socket = { write: vi.fn() } as any;

    await (server as any).handleMessage(socket, { type: 'setMode', mode: 'INVALID' });

    expect(sandboxSetModeMock).not.toHaveBeenCalled();
    expect(auditConfigChangeMock).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith(
      JSON.stringify({ type: 'error', message: 'Invalid mode. Use: STRICT | RELAXED | CONSENSUS' }) + '\n'
    );
  });

  it('parses newline-delimited socket stream with sticky and split packets', async () => {
    const { SocketServer } = await import('./socket-server.js');
    const server = new SocketServer();
    const socket = { write: vi.fn() } as any;
    const handleMessageSpy = vi.spyOn(server as any, 'handleMessage').mockResolvedValue(undefined);

    (server as any).handleSocketData(socket, Buffer.from('{"type":"list"}\n{"type":"sta'));
    (server as any).handleSocketData(socket, Buffer.from('tus","taskId":"task-1"}\n'));

    expect(handleMessageSpy).toHaveBeenCalledTimes(2);
    expect(handleMessageSpy).toHaveBeenNthCalledWith(1, socket, { type: 'list' });
    expect(handleMessageSpy).toHaveBeenNthCalledWith(2, socket, { type: 'status', taskId: 'task-1' });
  });
});
