import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditHelper } from '../infrastructure/audit/index.js';

const processInputMock = vi.fn();
const auditIntentMatchMock = vi.fn();
const auditLogMock = vi.fn();
const auditCliCommandMock = vi.fn();
const auditWorkflowEndMock = vi.fn();
const sandboxSetModeMock = vi.fn();
const auditConfigChangeMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock('../nl/orchestrator.js', () => ({
  processInput: processInputMock,
}));

vi.mock('../sandbox/sandbox.js', () => ({
  createSandboxManager: vi.fn(() => ({
    getConfig: () => ({ mode: 'RELAXED' }),
    setMode: sandboxSetModeMock,
    getStatusSummary: vi.fn().mockResolvedValue({}),
  })),
}));

function createAuditHelper(): AuditHelper {
  return {
    log: auditLogMock,
    cliCommand: auditCliCommandMock,
    cliOutput: vi.fn(),
    workflowStart: vi.fn(),
    workflowEnd: auditWorkflowEndMock,
    workflowStep: vi.fn(),
    securityAlert: vi.fn(),
    securityAction: vi.fn(),
    configChange: auditConfigChangeMock,
    intentMatch: auditIntentMatchMock,
    executorResult: vi.fn(),
    fileOperation: vi.fn(),
    sandboxDetect: vi.fn(),
  };
}

describe('SocketServer.executeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes audit helper and logger to processInput', async () => {
    const llmConfig = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
    };
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
    const server = new SocketServer({}, {
      auditHelper: createAuditHelper(),
      logger: { error: loggerErrorMock },
      getSessionId: () => 'session-test',
      llmConfigProvider: () => llmConfig,
    });
    const result = await (server as any).executeTask('check status');

    expect(processInputMock).toHaveBeenCalledWith(
      'check status',
      expect.objectContaining({
        intentMatch: expect.any(Function),
      }),
      expect.objectContaining({
        error: expect.any(Function),
      }),
    );
    expect(result).toContain('Execution delegated to Skill System.');
  });

  it('returns warning for non-executable capability result instead of delegated success', async () => {
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
    const server = new SocketServer({}, {
      auditHelper: createAuditHelper(),
      logger: { error: loggerErrorMock },
      getSessionId: () => 'session-test',
    });
    const result = await (server as any).executeTask('do something ambiguous');

    expect(result).toBe('No executable plan: clarification required before execution');
    expect(result).not.toContain('Execution delegated to Skill System.');
  });

  it('rejects invalid setMode value and does not call sandbox.setMode', async () => {
    const { SocketServer } = await import('./socket-server.js');
    const server = new SocketServer({}, {
      auditHelper: createAuditHelper(),
      logger: { error: loggerErrorMock },
      getSessionId: () => 'session-test',
    });
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
    const server = new SocketServer({}, {
      auditHelper: createAuditHelper(),
      logger: { error: loggerErrorMock },
      getSessionId: () => 'session-test',
    });
    const socket = { write: vi.fn() } as any;
    const handleMessageSpy = vi.spyOn(server as any, 'handleMessage').mockResolvedValue(undefined);

    (server as any).handleSocketData(socket, Buffer.from('{"type":"list"}\n{"type":"sta'));
    (server as any).handleSocketData(socket, Buffer.from('tus","taskId":"task-1"}\n'));

    expect(handleMessageSpy).toHaveBeenCalledTimes(2);
    expect(handleMessageSpy).toHaveBeenNthCalledWith(1, socket, { type: 'list' });
    expect(handleMessageSpy).toHaveBeenNthCalledWith(2, socket, { type: 'status', taskId: 'task-1' });
  });
});
