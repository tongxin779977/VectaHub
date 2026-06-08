import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeRouterMock = vi.fn();
const processInputWithTaskContractMock = vi.fn();
const createLLMConfigMock = vi.fn();
const createInterfaceMock = vi.fn();
const commandBridgeExecuteMock = vi.fn();

vi.mock('../nl/orchestrator.js', () => ({
  initializeRouter: initializeRouterMock,
  processInputWithTaskContract: processInputWithTaskContractMock,
}));

vi.mock('../nl/templates/index.js', () => ({
  INTENT_TEMPLATES: [],
}));

vi.mock('../nl/llm.js', () => ({
  createLLMConfig: createLLMConfigMock,
}));

vi.mock('readline', () => ({
  createInterface: createInterfaceMock,
}));

vi.mock('../chat/command-bridge.js', () => ({
  CommandBridge: vi.fn().mockImplementation(function CommandBridgeMock() {
    return {
      execute: commandBridgeExecuteMock,
    };
  }),
}));

describe('chat command', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    commandBridgeExecuteMock.mockReset();
    processInputWithTaskContractMock.mockReset();
  });

  afterEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  it('uses createLLMConfig as the single source of truth for chat fallback config', async () => {
    const mockConfig = {
      provider: 'openai',
      model: 'configured-model',
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
    };
    const answers = ['hello', 'exit'];
    const rl = {
      question: vi.fn((_question: string, callback: (answer: string) => void) => callback(answers.shift() ?? 'exit')),
      close: vi.fn(),
    };

    createLLMConfigMock.mockReturnValue(mockConfig);
    createInterfaceMock.mockReturnValue(rl);
    processInputWithTaskContractMock.mockResolvedValue({
      taskContract: {
        schemaVersion: '1.0',
        requestId: 'req_1',
        rawInput: 'hello',
        normalizedGoal: 'hello',
        confidence: 0.9,
        language: 'en-US',
        internalSignals: {
          intentCandidates: ['RUN_SCRIPT'],
          routeSource: 'mixed',
        },
        kind: 'blocked',
        reason: 'request is blocked',
        safetyCategory: 'unsupported',
      },
      legacy: {
        success: true,
        intent: 'RUN_SCRIPT',
        confidence: 0.9,
        taskList: { tasks: [] },
        metadata: {},
      },
    });

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(createLLMConfigMock).toHaveBeenCalled();
    expect(processInputWithTaskContractMock).toHaveBeenCalledWith(
      'hello',
      mockConfig,
      expect.objectContaining({
        intentMatch: expect.any(Function),
      }),
      expect.objectContaining({
        error: expect.any(Function),
      }),
    );
    expect(initializeRouterMock).toHaveBeenCalled();
  });

  it('executes routed vectahub doctor command when there is no reply', async () => {
    const answers = ['帮我诊断一下这个项目有哪些问题', 'exit'];
    const rl = {
      question: vi.fn((_question: string, callback: (answer: string) => void) => callback(answers.shift() ?? 'exit')),
      close: vi.fn(),
    };

    createLLMConfigMock.mockReturnValue(undefined);
    createInterfaceMock.mockReturnValue(rl);
    processInputWithTaskContractMock.mockResolvedValue({
      taskContract: {
        schemaVersion: '1.0',
        requestId: 'req_2',
        rawInput: '帮我诊断一下这个项目有哪些问题',
        normalizedGoal: '帮我诊断一下这个项目有哪些问题',
        confidence: 1,
        language: 'zh-CN',
        internalSignals: {
          intentCandidates: ['doctor'],
          routeSource: 'capability',
        },
        kind: 'execute',
        taskKind: 'diagnose',
        operation: 'doctor',
        target: {
          scope: 'project',
        },
        constraints: {
          requiresConfirmation: false,
          requiresVerification: false,
          sideEffects: ['command'],
        },
        executionStrategy: {
          mode: 'capability',
          commandSurfaceId: 'vectahub doctor',
        },
        expectedOutput: {
          format: 'text',
          audience: 'system',
        },
      },
      legacy: {
        success: true,
        intent: 'UNKNOWN',
        confidence: 1,
        taskList: {
          tasks: [
            {
              description: 'step_doctor',
              commands: [{ cli: 'vectahub', args: ['doctor'] }],
            },
          ],
        },
        metadata: {},
      },
    });
    commandBridgeExecuteMock.mockResolvedValue('doctor output');

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(commandBridgeExecuteMock).toHaveBeenCalledWith('doctor');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('任务摘要：诊断当前项目'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('doctor output'));

    stdoutSpy.mockRestore();
  });

  it('executes doctor even when legacy reply is present alongside execute task contract', async () => {
    const answers = ['帮我诊断一下这个项目并告诉我结果', 'exit'];
    const rl = {
      question: vi.fn((_question: string, callback: (answer: string) => void) => callback(answers.shift() ?? 'exit')),
      close: vi.fn(),
    };

    createLLMConfigMock.mockReturnValue(undefined);
    createInterfaceMock.mockReturnValue(rl);
    processInputWithTaskContractMock.mockResolvedValue({
      taskContract: {
        schemaVersion: '1.0',
        requestId: 'req_execute_with_reply',
        rawInput: '帮我诊断一下这个项目并告诉我结果',
        normalizedGoal: '帮我诊断一下这个项目并告诉我结果',
        confidence: 1,
        language: 'zh-CN',
        internalSignals: {
          intentCandidates: ['doctor'],
          routeSource: 'capability',
        },
        kind: 'execute',
        taskKind: 'diagnose',
        operation: 'doctor',
        target: {
          scope: 'project',
        },
        constraints: {
          requiresConfirmation: false,
          requiresVerification: false,
          sideEffects: ['command'],
        },
        executionStrategy: {
          mode: 'capability',
          commandSurfaceId: 'vectahub doctor',
        },
        expectedOutput: {
          format: 'text',
          audience: 'system',
        },
      },
      legacy: {
        success: true,
        intent: 'doctor',
        confidence: 1,
        reply: '我会先给你一个解释',
        taskList: {
          tasks: [
            {
              description: 'step_doctor',
              commands: [{ cli: 'vectahub', args: ['doctor'] }],
            },
          ],
        },
        metadata: {},
      },
    });
    commandBridgeExecuteMock.mockResolvedValue('doctor output');

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(commandBridgeExecuteMock).toHaveBeenCalledWith('doctor');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('doctor output'));
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('我会先给你一个解释'));

    stdoutSpy.mockRestore();
  });

  it('blocks invalid vectahub command surfaces before reaching command bridge', async () => {
    const answers = ['帮我诊断 CI', 'exit'];
    const rl = {
      question: vi.fn((_question: string, callback: (answer: string) => void) => callback(answers.shift() ?? 'exit')),
      close: vi.fn(),
    };

    createLLMConfigMock.mockReturnValue(undefined);
    createInterfaceMock.mockReturnValue(rl);
    processInputWithTaskContractMock.mockResolvedValue({
      taskContract: {
        schemaVersion: '1.0',
        requestId: 'req_3',
        rawInput: '帮我诊断 CI',
        normalizedGoal: '帮我诊断 CI',
        confidence: 1,
        language: 'zh-CN',
        internalSignals: {
          intentCandidates: ['doctor'],
          routeSource: 'capability',
        },
        kind: 'execute',
        taskKind: 'diagnose',
        operation: 'doctor',
        target: {
          scope: 'project',
        },
        constraints: {
          requiresConfirmation: false,
          requiresVerification: false,
          sideEffects: ['command'],
        },
        executionStrategy: {
          mode: 'capability',
          commandSurfaceId: 'vectahub ci diagnose',
        },
        expectedOutput: {
          format: 'text',
          audience: 'system',
        },
      },
      legacy: {
        success: true,
        intent: 'UNKNOWN',
        confidence: 1,
        taskList: {
          tasks: [],
        },
        metadata: {},
      },
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(commandBridgeExecuteMock).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('任务执行已阻断'));

    stdoutSpy.mockRestore();
  });

  it('does not send direct-command task contracts into command bridge', async () => {
    const answers = ['帮我执行 git status', 'exit'];
    const rl = {
      question: vi.fn((_question: string, callback: (answer: string) => void) => callback(answers.shift() ?? 'exit')),
      close: vi.fn(),
    };

    createLLMConfigMock.mockReturnValue(undefined);
    createInterfaceMock.mockReturnValue(rl);
    processInputWithTaskContractMock.mockResolvedValue({
      taskContract: {
        schemaVersion: '1.0',
        requestId: 'req_4',
        rawInput: '帮我执行 git status',
        normalizedGoal: '帮我执行 git status',
        confidence: 0.9,
        language: 'mixed',
        internalSignals: {
          intentCandidates: ['tool_run'],
          routeSource: 'llm-tool-calling',
        },
        kind: 'execute',
        taskKind: 'modify',
        operation: 'tool_run',
        target: {
          scope: 'environment',
        },
        constraints: {
          requiresConfirmation: false,
          requiresVerification: false,
          sideEffects: ['command'],
        },
        executionStrategy: {
          mode: 'direct-command',
          commandSurfaceId: 'git status',
        },
        expectedOutput: {
          format: 'text',
          audience: 'system',
        },
      },
      legacy: {
        success: true,
        intent: 'tool_run',
        confidence: 0.9,
        taskList: {
          tasks: [],
        },
        metadata: {},
      },
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(commandBridgeExecuteMock).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('不会通过内部命令桥自动执行'));

    stdoutSpy.mockRestore();
  });
});
