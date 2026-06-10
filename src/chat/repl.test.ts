import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as readline from 'node:readline';
import { createRepl } from './repl.js';
import { createCommandManager } from './command-manager.js';
import { createDefaultChatConfig, type ChatConfig } from './config.js';
import type { ReplDeps, REPLDeps } from './types.js';
import { LLMClient } from '../nl/llm.js';

const { processInputWithTaskContractMock } = vi.hoisted(() => ({
  processInputWithTaskContractMock: vi.fn(),
}));

vi.mock('../nl/orchestrator.js', () => ({
  processInputWithTaskContract: processInputWithTaskContractMock,
}));

const defaultCfg = createDefaultChatConfig();
const cmdManager = createCommandManager(defaultCfg);
const parseInput = (input: string) => cmdManager.parseInput(input);

vi.mock('node:readline', () => {
  const mockRl = {
    question: vi.fn((_query: string, callback: (answer: string) => void) => callback('y')),
    close: vi.fn(),
    on: vi.fn(),
    pause: vi.fn(),
    prompt: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => mockRl),
    __rl: mockRl,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    })),
    exec: vi.fn((command: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
      if (command.includes('git rev-parse --show-toplevel')) {
        callback(null, '/mock/project/root', '');
      } else {
        callback(null, '', '');
      }
    }),
  };
});

const mockLLMClientInstance = {
  complete: vi.fn().mockResolvedValue({
    tool_calls: [],
    intent: 'test-intent',
    confidence: 1.0,
    workflow: { name: 'test', steps: [] },
  }),
};

vi.mock('../nl/llm.js', () => {
  return {
    createLLMConfig: vi.fn(() => ({ provider: 'openai', model: 'mock' })),
    LLMClient: vi.fn().mockImplementation(() => mockLLMClientInstance),
  };
});

vi.mock('../chat/command-bridge.js', () => {
  const mockProgram = {
    name: () => 'vectahub',
    parseAsync: vi.fn().mockResolvedValue(undefined),
    commands: [],
  };
  const mockCommandBridge = {
    execute: vi.fn().mockResolvedValue('Mock command bridge output from mockCommandBridge'),
    program: mockProgram,
  };
  return {
    createCommandBridge: vi.fn(() => mockCommandBridge),
    CommandBridge: vi.fn(() => mockCommandBridge),
    __mockCommandBridge: mockCommandBridge,
  };
});

const mockChatConfig: ChatConfig = {
  ...defaultCfg,
  logLevel: 'normal',
  executeMode: 'auto',
};

function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('pino').Logger;
}

function createMockAuditHelper() {
  return {
    log: vi.fn(),
    cliCommand: vi.fn(),
    cliOutput: vi.fn(),
    workflowStart: vi.fn(),
    workflowEnd: vi.fn(),
    workflowStep: vi.fn(),
    securityAlert: vi.fn(),
    securityAction: vi.fn(),
    configChange: vi.fn(),
    intentMatch: vi.fn(),
    executorResult: vi.fn(),
    fileOperation: vi.fn(),
    sandboxDetect: vi.fn(),
  };
}

function createMockDeps(overrides?: Partial<REPLDeps>): REPLDeps {
  return {
    nlProcessor: { parse: vi.fn().mockResolvedValue({ success: true, intent: 'test', confidence: 0.9, metadata: { path: 'dialog' } }) },
    contextBuilder: { buildContext: vi.fn().mockResolvedValue({ cwd: '/test' }) },
    llmConfig: { provider: 'openai', model: 'gpt-4' },
    sessionManager: {
      getOrCreateSession: vi.fn().mockReturnValue({
        sessionId: 'test',
        history: [],
        entities: {},
        projectContext: { cwd: '/test' },
      }),
      addAssistantMessage: vi.fn(),
      addUserMessage: vi.fn(),
      getSession: vi.fn().mockReturnValue({
        sessionId: 'test',
        history: [],
        projectContext: { cwd: '/test' },
        userPreferences: { executionMode: 'strict', preferredTools: [], verbose: false, autoConfirm: false },
        recentActions: [],
      }),
      buildContextAwarePrompt: vi.fn().mockReturnValue(''),
    } as unknown as ReplDeps['sessionManager'],
    useLLM: true,
    config: mockChatConfig,
    commandBridge: {
      execute: vi.fn().mockResolvedValue('Mock command bridge output'),
    } as unknown as ReplDeps['commandBridge'],
    paramExtractor: {
      extract: vi.fn().mockReturnValue({ param1: 'value1' }),
    } as unknown as ReplDeps['paramExtractor'],
    auditHelper: createMockAuditHelper() as unknown as ReplDeps['auditHelper'],
    logger: createMockLogger(),
    ...overrides,
  };
}

function createReplyEnvelope(reply: string) {
  return {
    taskContract: {
      schemaVersion: '1.0' as const,
      requestId: 'reply_req',
      rawInput: 'hello',
      normalizedGoal: 'hello',
      confidence: 0.9,
      language: 'en-US' as const,
      internalSignals: {
        intentCandidates: ['QUERY_INFO'],
        routeSource: 'mixed' as const,
      },
      kind: 'reply' as const,
      replyMode: 'answer' as const,
      answerTopic: 'general',
    },
    legacy: {
      success: true,
      intent: 'QUERY_INFO',
      confidence: 0.9,
      reply,
      metadata: {
        path: 'dialog',
      },
    },
  };
}

function createExecuteEnvelope(
  overrides: {
    commandSurfaceId?: string;
    mode?: 'capability' | 'direct-command' | 'workflow-draft' | 'agent-runtime';
    rawInput?: string;
    reply?: string;
    workflowYAML?: string;
  } = {},
) {
  const rawInput = overrides.rawInput ?? '帮我诊断一下这个项目';
  return {
    taskContract: {
      schemaVersion: '1.0' as const,
      requestId: 'execute_req',
      rawInput,
      normalizedGoal: rawInput,
      confidence: 1,
      language: 'zh-CN' as const,
      internalSignals: {
        intentCandidates: ['doctor'],
        routeSource: 'capability' as const,
      },
      kind: 'execute' as const,
      taskKind: overrides.workflowYAML ? 'workflow' as const : 'diagnose' as const,
      operation: 'doctor',
      target: {
        scope: 'project' as const,
      },
      constraints: {
        requiresConfirmation: false,
        requiresVerification: Boolean(overrides.workflowYAML),
        sideEffects: ['command' as const],
      },
      executionStrategy: {
        mode: overrides.mode ?? 'capability',
        commandSurfaceId: overrides.commandSurfaceId ?? 'vectahub doctor',
      },
      expectedOutput: {
        format: overrides.workflowYAML ? 'workflow' as const : 'text' as const,
        audience: 'system' as const,
      },
    },
    legacy: {
      success: true,
      intent: 'doctor',
      confidence: 1,
      reply: overrides.reply,
      workflowYAML: overrides.workflowYAML,
      taskList: {
        tasks: [{ commands: [{ cli: 'vectahub', args: ['doctor'] }] }],
      },
      metadata: {
        path: 'category-router',
      },
    },
  };
}

describe('parseInput', () => {
  it('should parse ! prefix as shell command with prefix stripped', () => {
    const result = parseInput('!ls -la');
    expect(result.type).toBe('shell');
    expect(result.raw).toBe('!ls -la');
    expect(result.parsed).toBe('ls -la');
  });

  it('should parse slash command input', () => {
    const result = parseInput('/help');
    expect(result.type).toBe('slash-command');
    expect(result.raw).toBe('/help');
    expect(result.parsed).toBe('help');
    expect(result.args).toEqual([]);
  });

  it('should parse slash command with args', () => {
    const result = parseInput('/config set key value');
    expect(result.type).toBe('slash-command');
    expect(result.parsed).toBe('config');
    expect(result.args).toEqual(['set', 'key', 'value']);
  });

  it('should parse NL input', () => {
    const result = parseInput('list all files in the current directory');
    expect(result.type).toBe('nl');
    expect(result.raw).toBe('list all files in the current directory');
    expect(result.parsed).toBe('list all files in the current directory');
  });

  it('should treat exit as NL input', () => {
    const result = parseInput('exit');
    expect(result.type).toBe('nl');
    expect(result.parsed).toBe('exit');
  });
});

describe('createRepl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create repl with start method', () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    expect(repl).toHaveProperty('start');
    expect(typeof repl.start).toBe('function');
  });

  it('/help should list all slash commands', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const handler = repl.getSlashCommands();
    const helpCmd = handler.get('help');
    expect(helpCmd).toBeDefined();
    const result = await helpCmd!.handler([], { sessionId: 'test', config: mockChatConfig });
    expect(result).toContain('help');
    expect(result).toContain('exit');
  });

  it('/exit should return exit signal', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps);
    const handler = repl.getSlashCommands();
    const exitCmd = handler.get('exit');
    const result = await exitCmd!.handler([], { sessionId: 'test', config: mockChatConfig });
    expect(result).toBe('__EXIT__');
  });

  it('should process NL input through nlProcessor', async () => {
    const deps = createMockDeps();
    const nlParseSpy = deps.nlProcessor.parse as ReturnType<typeof vi.fn>;
    const repl = createRepl(deps);
    const result = await repl.processInput('run tests');
    expect(nlParseSpy).toHaveBeenCalledWith({ input: 'run tests', sessionId: expect.any(String), options: { useLLM: true } });
    expect(result).toBeDefined();
  });

  it('should execute shell command via commandBridge', async () => {
    const mockBridgeExecute = vi.fn().mockResolvedValue('bridge output');
    const deps = createMockDeps({
      commandBridge: { execute: mockBridgeExecute } as unknown as ReplDeps['commandBridge'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!ls -la');
    expect(mockBridgeExecute).toHaveBeenCalledWith('ls -la');
    expect(result.type).toBe('command-result');
    expect(result.content).toBe('bridge output');
  });
});

describe('Workflow Execution Modes', () => {
  let mockRl: ReturnType<typeof readline.createInterface> & { question: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> };
  let mockWorkflowEngine: {
    execute: ReturnType<typeof vi.fn>;
    getWorkflow: ReturnType<typeof vi.fn>;
    pauseExecution: ReturnType<typeof vi.fn>;
    resumeExecution: ReturnType<typeof vi.fn>;
    abortExecution: ReturnType<typeof vi.fn>;
  };
  let mockNlProcessor: { parse: ReturnType<typeof vi.fn> };
  let mockedLLMClient: typeof mockLLMClientInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mockedReadline = vi.mocked(readline) as unknown as { __rl: typeof mockRl };
    mockRl = mockedReadline.__rl;
    mockWorkflowEngine = {
      execute: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'COMPLETED',
        duration: 100,
        steps: [{ stepId: 'step1', status: 'COMPLETED', output: ['✅ 执行成功'] }],
        warnings: [],
        logs: [],
      }),
      getWorkflow: vi.fn().mockReturnValue({ id: 'mock-workflow-id', steps: [] }),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      abortExecution: vi.fn(),
    };
    mockNlProcessor = {
      parse: vi.fn().mockResolvedValue({
        success: true,
        intent: 'test-intent',
        confidence: 0.8,
        workflowYAML: 'steps:\n  - id: step1\n    type: exec\n    cli: echo\n    args: ["hello"]',
        taskList: {
          intent: 'test-intent',
          tasks: [{ commands: [{ cli: 'echo', args: ['hello'] }] }],
        },
        metadata: { path: 'category-router' },
      }),
    };
    mockedLLMClient = mockLLMClientInstance;
  });

  it('should auto-execute workflow in "auto" mode', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'auto' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockWorkflowEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'relaxed' }),
      expect.objectContaining({ initialVariables: { param1: 'value1' } }),
    );
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('执行成功');
  });

  it('should create LLM client with injected audit helper in auto mode', async () => {
    const auditHelper = createMockAuditHelper();
    const deps = createMockDeps({
      auditHelper: auditHelper as unknown as ReplDeps['auditHelper'],
      config: { ...mockChatConfig, executeMode: 'auto' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });

    const repl = createRepl(deps);
    await repl.processInput('some input');

    expect(LLMClient).toHaveBeenCalledWith(
      deps.llmConfig,
      expect.objectContaining({ auditHelper }),
    );
  });

  it('should prompt for confirmation in "confirm" mode and execute if "y"', async () => {
    vi.mocked(mockRl.question).mockImplementationOnce((_query: string, callback: (answer: string) => void) => callback('y'));
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'confirm' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockRl.question).toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'relaxed' }),
      expect.objectContaining({ initialVariables: { param1: 'value1' } }),
    );
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('执行成功');
  });

  it('should prompt for confirmation in "confirm" mode and not execute if "n"', async () => {
    vi.mocked(mockRl.question).mockImplementationOnce((_query: string, callback: (answer: string) => void) => callback('n'));
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'confirm' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockRl.question).toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(result.type).toBe('text');
    expect(result.content).toContain('已取消自动执行');
  });

  it('should generate workflow and wait for manual execution in "manual" mode', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(result.type).toBe('text');
    expect(result.content).toContain('💡 输入 `执行`、`/execute` 来运行。');
  });

  it('should preserve for_each workflow structure when generating workflow', async () => {
    const taskContractProcessor = vi.fn().mockResolvedValue(createExecuteEnvelope({
      workflowYAML: [
        'steps:',
        '  - type: for_each',
        '    items: "a\\nb"',
        '    body:',
        '      - type: exec',
        '        cli: echo',
        '        args: ["${item}"]',
      ].join('\n'),
      mode: 'workflow-draft',
      commandSurfaceId: 'echo hello',
    }));

    const deps = createMockDeps({
      taskContractProcessor,
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(result.type).toBe('text');
    expect(result.content).toContain('工作流已生成');
  });

  it('should fail instead of generating echo fallback for invalid exec workflow step', async () => {
    const taskContractProcessor = vi.fn().mockResolvedValue(createExecuteEnvelope({
      workflowYAML: [
        'steps:',
        '  - type: exec',
        '    args: ["hello"]',
      ].join('\n'),
      mode: 'workflow-draft',
      commandSurfaceId: 'echo hello',
    }));

    const deps = createMockDeps({
      taskContractProcessor,
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(result.type).toBe('error');
    expect(result.content).toContain('missing cli');
  });
});

describe('Bare execute intent shortcut', () => {
  let mockNlProcessor: { parse: ReturnType<typeof vi.fn> };
  let mockWorkflowEngine: {
    execute: ReturnType<typeof vi.fn>;
    getWorkflow: ReturnType<typeof vi.fn>;
    pauseExecution: ReturnType<typeof vi.fn>;
    resumeExecution: ReturnType<typeof vi.fn>;
    abortExecution: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowEngine = {
      execute: vi.fn().mockResolvedValue({
        executionId: 'exec-bare',
        status: 'COMPLETED',
        duration: 50,
        steps: [{ stepId: 'step1', status: 'COMPLETED', output: ['✅ bare execute ok'] }],
        warnings: [],
        logs: [],
      }),
      getWorkflow: vi.fn(),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      abortExecution: vi.fn(),
    };
    mockNlProcessor = {
      parse: vi.fn().mockResolvedValue({
        success: true,
        intent: 'test-intent',
        confidence: 0.8,
        workflowYAML: 'steps:\n  - id: step1\n    type: exec\n    cli: echo\n    args: ["hello"]',
        taskList: { intent: 'test-intent', tasks: [{ commands: [{ cli: 'echo', args: ['hello'] }] }] },
        metadata: { path: 'category-router' },
      }),
    };
  });

  it('executes the pending workflow when user types bare "执行"', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);

    const generated = await repl.processInput('some input');
    expect(generated.type).toBe('text');
    expect(generated.content).toContain('工作流已生成');
    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();

    const nlParseSpy = mockNlProcessor.parse as ReturnType<typeof vi.fn>;
    nlParseSpy.mockClear();

    const executed = await repl.processInput('执行');

    expect(nlParseSpy).not.toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).toHaveBeenCalledTimes(1);
    expect(executed.type).toBe('command-result');
    expect(executed.content).toContain('bare execute ok');
  });

  it('executes pending workflow for English synonym "run"', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    await repl.processInput('some input');

    const executed = await repl.processInput('run');

    expect(mockWorkflowEngine.execute).toHaveBeenCalledTimes(1);
    expect(executed.type).toBe('command-result');
  });

  it('executes pending workflow for "运行" and "go"', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    await repl.processInput('some input');

    const executed1 = await repl.processInput('运行');
    expect(mockWorkflowEngine.execute).toHaveBeenCalledTimes(1);
    expect(executed1.type).toBe('command-result');

    await repl.processInput('some input');
    const executed2 = await repl.processInput('go');
    expect(mockWorkflowEngine.execute).toHaveBeenCalledTimes(2);
    expect(executed2.type).toBe('command-result');
  });

  it('returns error when no pending workflow exists for bare execute', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);

    const result = await repl.processInput('执行');

    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(result.type).toBe('error');
    expect(result.content).toContain('没有待执行的工作流');
  });

  it('does not treat longer NL sentences as bare execute', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine as unknown as ReplDeps['workflowEngine'],
      nlProcessor: mockNlProcessor as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);

    const result = await repl.processInput('执行一下 git status');

    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(mockNlProcessor.parse).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

describe('TaskContract-first REPL routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('outputs reply content without leaking intent or step metadata', async () => {
    const taskContractProcessor = vi.fn().mockResolvedValue(createReplyEnvelope('项目状态正常。'));
    const deps = createMockDeps({ taskContractProcessor });
    const repl = createRepl(deps);

    const result = await repl.processInput('当前项目怎么样');

    expect(result.type).toBe('text');
    expect(result.content).toContain('项目状态正常。');
    expect(result.content).not.toContain('Intent:');
    expect(result.content).not.toContain('step_');
  });

  it('executes validated vectahub doctor command via internal bridge', async () => {
    const bridgeExecute = vi.fn().mockResolvedValue('doctor output');
    const taskContractProcessor = vi.fn().mockResolvedValue(createExecuteEnvelope({
      commandSurfaceId: 'vectahub doctor',
    }));
    const deps = createMockDeps({
      taskContractProcessor,
      commandBridge: { execute: bridgeExecute } as unknown as ReplDeps['commandBridge'],
    });
    const repl = createRepl(deps);

    const result = await repl.processInput('帮我诊断一下这个项目');

    expect(bridgeExecute).toHaveBeenCalledWith('doctor');
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('doctor output');
  });

  it('blocks invalid vectahub command surfaces before bridge execution', async () => {
    const bridgeExecute = vi.fn().mockResolvedValue('should not run');
    const taskContractProcessor = vi.fn().mockResolvedValue(createExecuteEnvelope({
      rawInput: '帮我诊断 CI',
      commandSurfaceId: 'vectahub ci diagnose',
    }));
    const deps = createMockDeps({
      taskContractProcessor,
      commandBridge: { execute: bridgeExecute } as unknown as ReplDeps['commandBridge'],
    });
    const repl = createRepl(deps);

    const result = await repl.processInput('帮我诊断 CI');

    expect(bridgeExecute).not.toHaveBeenCalled();
    expect(result.type).toBe('text');
    expect(result.content).toContain('任务执行已阻断');
    expect(result.content).not.toContain('vectahub ci diagnose');
  });

  it('does not send direct-command contracts into internal bridge', async () => {
    const bridgeExecute = vi.fn().mockResolvedValue('should not run');
    const taskContractProcessor = vi.fn().mockResolvedValue(createExecuteEnvelope({
      rawInput: '帮我执行 git status',
      mode: 'direct-command',
      commandSurfaceId: 'git status',
    }));
    const deps = createMockDeps({
      taskContractProcessor,
      commandBridge: { execute: bridgeExecute } as unknown as ReplDeps['commandBridge'],
    });
    const repl = createRepl(deps);

    const result = await repl.processInput('帮我执行 git status');

    expect(bridgeExecute).not.toHaveBeenCalled();
    expect(result.type).toBe('text');
    expect(result.content).toContain('不会通过内部命令桥自动执行');
  });

  it('prefers execute task contracts over legacy reply content', async () => {
    const bridgeExecute = vi.fn().mockResolvedValue('doctor output');
    const taskContractProcessor = vi.fn().mockResolvedValue(createExecuteEnvelope({
      rawInput: '帮我诊断并说明原因',
      commandSurfaceId: 'vectahub doctor',
      reply: '我先解释一下',
    }));
    const deps = createMockDeps({
      taskContractProcessor,
      commandBridge: { execute: bridgeExecute } as unknown as ReplDeps['commandBridge'],
    });
    const repl = createRepl(deps);

    const result = await repl.processInput('帮我诊断并说明原因');

    expect(bridgeExecute).toHaveBeenCalledWith('doctor');
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('doctor output');
  });
});

describe('Command Bridge functionality', () => {
  let mockCommandBridge: { execute: ReturnType<typeof vi.fn> };
  let mockCommandExecutor: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCommandBridge = (await import('../chat/command-bridge.js') as unknown as { __mockCommandBridge: typeof mockCommandBridge }).__mockCommandBridge;
    mockCommandExecutor = {
      execute: vi.fn().mockResolvedValue('Mock shell command output'),
    };
  });

  it('should use commandBridge for ! prefix commands', async () => {
    const deps = createMockDeps({
      commandBridge: mockCommandBridge as unknown as ReplDeps['commandBridge'],
      commandExecutor: mockCommandExecutor as unknown as ReplDeps['commandExecutor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!my-vectahub-command arg1');

    expect(mockCommandBridge.execute).toHaveBeenCalledWith('my-vectahub-command arg1');
    expect(result.type).toBe('command-result');
  });

  it('should fallback to commandExecutor when commandBridge throws', async () => {
    mockCommandBridge.execute.mockRejectedValueOnce(new Error('bridge failed'));
    const deps = createMockDeps({
      commandBridge: mockCommandBridge as unknown as ReplDeps['commandBridge'],
      commandExecutor: mockCommandExecutor as unknown as ReplDeps['commandExecutor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!ls -la');

    expect(mockCommandBridge.execute).toHaveBeenCalledWith('ls -la');
    expect(mockCommandExecutor.execute).toHaveBeenCalledWith('ls -la');
    expect(result.type).toBe('command-result');
    expect(result.content).toBe('Mock shell command output');
  });

  it('should handle errors from commandBridge and commandExecutor', async () => {
    mockCommandBridge.execute.mockRejectedValueOnce(new Error('Command bridge failed'));
    mockCommandExecutor.execute.mockRejectedValueOnce(new Error('executor failed'));
    const deps = createMockDeps({
      commandBridge: mockCommandBridge as unknown as ReplDeps['commandBridge'],
      commandExecutor: mockCommandExecutor as unknown as ReplDeps['commandExecutor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!failing-command');

    expect(mockCommandBridge.execute).toHaveBeenCalledWith('failing-command');
    expect(result.type).toBe('error');
    expect(result.content).toContain('执行出错');
  });
});

describe('useLLM=false DI regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('outputs reply from nlProcessor when useLLM=false without creating LLM client', async () => {
    const mockParse = vi.fn().mockResolvedValue({
      success: true,
      intent: 'QUERY_INFO',
      confidence: 0.9,
      reply: '项目状态正常。',
      metadata: { path: 'dialog' },
    });
    const deps = createMockDeps({
      useLLM: false,
      llmConfig: null,
      nlProcessor: { parse: mockParse } as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('当前项目怎么样');

    expect(mockParse).toHaveBeenCalledWith({ input: '当前项目怎么样', sessionId: expect.any(String), options: { useLLM: false } });
    expect(result.type).toBe('text');
    expect(result.content).toContain('项目状态正常。');
    expect(result.content).not.toContain('Intent:');
    expect(result.content).not.toContain('step_');
    expect(LLMClient).not.toHaveBeenCalled();
  });

  it('executes TaskContract from nlProcessor when useLLM=false', async () => {
    const bridgeExecute = vi.fn().mockResolvedValue('doctor output');
    const deps = createMockDeps({
      useLLM: false,
      llmConfig: null,
      nlProcessor: {
        parse: vi.fn().mockResolvedValue({
          success: true,
          intent: 'doctor',
          confidence: 1,
          metadata: { path: 'category-router' },
          taskList: {
            tasks: [{ commands: [{ cli: 'vectahub', args: ['doctor'] }] }],
          },
        }),
      } as unknown as ReplDeps['nlProcessor'],
      commandBridge: { execute: bridgeExecute } as unknown as ReplDeps['commandBridge'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('帮我诊断一下这个项目');

    expect(result.type).toBe('command-result');
    expect(result.content).toContain('doctor output');
    expect(bridgeExecute).toHaveBeenCalledWith('doctor');
    expect(LLMClient).not.toHaveBeenCalled();
  });

  it('skips nlProcessor.parse when taskContractProcessor is injected', async () => {
    const nlParseSpy = vi.fn().mockResolvedValue({
      success: true,
      intent: 'QUERY_INFO',
      confidence: 0.9,
      reply: 'should not be reached',
      metadata: { path: 'dialog' },
    });
    const taskContractProcessor = vi.fn().mockResolvedValue(createReplyEnvelope('来自注入处理器'));
    const deps = createMockDeps({
      taskContractProcessor,
      nlProcessor: { parse: nlParseSpy } as unknown as ReplDeps['nlProcessor'],
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('你好');

    expect(taskContractProcessor).toHaveBeenCalledWith('你好');
    expect(nlParseSpy).not.toHaveBeenCalled();
    expect(result.type).toBe('text');
    expect(result.content).toContain('来自注入处理器');
  });
});
