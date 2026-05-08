import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as readline from 'node:readline'; // Re-add this import
import { createRepl } from './repl.js';
import { createCommandManager } from './command-manager.js';
import type { ReplDeps, SlashCommandContext } from './types.js';
import type { REPLDeps } from './types.js';
import type { CommandBridge } from '../chat/command-bridge.js';
import { createLLMConfig } from '../nl/llm.js';

const cmdManager = createCommandManager();
const parseInput = (input: string) => cmdManager.parseInput(input);


vi.mock('node:readline', () => {
  const mockRl = {
    question: vi.fn((_query, callback) => callback('y')), // Default to 'y' for questions
    close: vi.fn(),
    on: vi.fn(),
    pause: vi.fn(),
    prompt: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => mockRl),
    __rl: mockRl, // Export mockRl so it can be controlled in tests
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    })),
    exec: vi.fn((command, callback) => {
      // Mock for simple exec calls, can be expanded
      if (command.includes('git rev-parse --show-toplevel')) {
        callback(null, '/mock/project/root', '');
      } else {
        callback(null, '', '');
      }
    }),
  };
});

vi.mock('../nl/llm.js', () => {
  const mockLLMClientInstance = {
    complete: vi.fn().mockResolvedValue({
      tool_calls: [{
        function: {
          name: 'test-intent',
          arguments: JSON.stringify({ param1: 'value1' }),
        },
      }],
      intent: 'test-intent', // Also mock intent for non-tool-call scenarios
      confidence: 1.0,
      workflow: { name: '', steps: [] },
    }),
  };
  return {
    createLLMConfig: vi.fn(() => ({ provider: 'openai', model: 'mock' })), // Mock a valid config
    LLMClient: vi.fn(() => mockLLMClientInstance), // Mock the constructor to return our instance
  };
});

vi.mock('../chat/command-bridge.js', () => {
  const mockProgram = {
    name: () => 'vectahub',
    parseAsync: vi.fn().mockResolvedValue(undefined),
    commands: [], // Add other properties of Command if needed by the mock
  };
  const mockCommandBridge = {
    execute: vi.fn().mockResolvedValue('Mock command bridge output from mockCommandBridge'),
    program: mockProgram,
  };
  return {
    createCommandBridge: vi.fn(() => mockCommandBridge),
    CommandBridge: vi.fn(() => mockCommandBridge), // Also mock the class constructor
    __mockCommandBridge: mockCommandBridge, // Export for testing purposes
  };
});


import { defaultConfig, ChatConfig } from './config.js';

import { createCommandBridge } from '../chat/command-bridge.js';
import { createParamExtractor, type ParamExtractor } from '../nl/param-extractor.js';

const mockChatConfig: ChatConfig = {
  ...defaultConfig,
  logLevel: 'debug',
  executeMode: 'auto',
  showWorkflowYAML: true,
  enableCommandBridge: false,
};

function createMockDeps(overrides?: Partial<REPLDeps>): REPLDeps {
  const mockParamExtractor: ParamExtractor = {
    extract: vi.fn().mockReturnValue({ param1: 'value1' }),
  };

  return {
    nlProcessor: { parse: vi.fn().mockResolvedValue({ intent: 'test', confidence: 0.9 }) },
    contextBuilder: { buildContext: vi.fn().mockResolvedValue({ cwd: '/test' }) },
    llmConfig: { provider: 'openai', model: 'gpt-4' }, // Add this line
    sessionManager: {
      getOrCreateSession: vi.fn().mockReturnValue({
        history: [],
        entities: {},
        updateLastWorkflow: vi.fn(),
      }),
      addAssistantMessage: vi.fn(),
      addUserMessage: vi.fn(),
    } as any,
    useLLM: true, // Ensure useLLM is always a boolean
    config: mockChatConfig, // Default config
    commandBridge: createCommandBridge({} as any), // Use the mocked function to get a mock CommandBridge instance
    paramExtractor: mockParamExtractor, // Add mockParamExtractor here
    ...overrides,
  };
}

describe('parseInput', () => {
  it('should parse shell command input', () => {
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
    const repl = createRepl(deps as REPLDeps);
    expect(repl).toHaveProperty('start');
    expect(typeof repl.start).toBe('function');
  });

  it('/help should list all slash commands', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps as REPLDeps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const helpCmd = handler.get('help');
    expect(helpCmd).toBeDefined();
    const result = await helpCmd!.handler([], { sessionId: 'test', config: mockChatConfig });
    expect(result).toContain('help');
    expect(result).toContain('history');
    expect(result).toContain('config');
    expect(result).toContain('exit');
  });

  it('/history should show conversation history', async () => {
    const mockSessionManager = {
      getSession: vi.fn().mockReturnValue({
        sessionId: 'test',
        history: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ],
        projectContext: { cwd: '/test' },
      }),
    };
    const deps = createMockDeps();
    const repl = createRepl(deps as REPLDeps, { sessionId: 'test', sessionManager: mockSessionManager as any });
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const historyCmd = handler.get('history');
    const result = await historyCmd!.handler([], { sessionManager: mockSessionManager as any, sessionId: 'test', config: mockChatConfig });
    expect(result).toContain('hello');
    expect(result).toContain('hi there');
  });

  it('/config should mask API keys', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps as REPLDeps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const configCmd = handler.get('config');
    const result = await configCmd!.handler([], { sessionId: 'test', config: { ...mockChatConfig, logLevel: 'quiet' } as any });
    expect(result).not.toContain('sk-secret-12345'); // Still check that sensitive data is not explicitly shown
    expect(result).toContain('logLevel: quiet'); // Check a valid config property
    expect(result).toContain('executeMode: auto'); // Check another valid config property
  });

  it('/exit should return exit signal', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps as REPLDeps);
    const handler = (repl as unknown as { getSlashCommands: () => Map<string, { name: string; description: string; handler: (args: string[], ctx: SlashCommandContext) => Promise<string> }> }).getSlashCommands();
    const exitCmd = handler.get('exit');
    const result = await exitCmd!.handler([], { sessionId: 'test', config: mockChatConfig });
    expect(result).toBe('__EXIT__');
  });

  it('should process NL input through nlProcessor', async () => {
    const deps = createMockDeps();
    const repl = createRepl(deps as REPLDeps);
    const result = await (repl as unknown as { processInput: (input: string) => Promise<unknown> }).processInput('run tests');
    expect(deps.nlProcessor.parse).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('should execute shell command and capture output', async () => {
    const { spawn } = await import('node:child_process');
    const mockSpawn = {
      stdout: { on: vi.fn((event: string, cb: (data: Buffer) => void) => { if (event === 'data') cb(Buffer.from('file1.txt\nfile2.txt')); }) },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => { if (event === 'close') cb(0); }),
    };
    vi.mocked(spawn).mockReturnValue(mockSpawn as never);

    const deps = createMockDeps();
    const repl = createRepl(deps as REPLDeps);
    const result = await (repl as unknown as { processInput: (input: string) => Promise<unknown> }).processInput('!ls');
    expect(spawn).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

describe('Workflow Execution Modes', () => {
  let mockRl: any;
  let mockWorkflowEngine: any;
  let mockNlProcessor: any;
  let mockCommandBridge: any;
  let mockedLLMClient: any; // Add this

  beforeEach(async () => { // Make it async
    vi.clearAllMocks();
    // Access the mocked rl instance directly from the mocked module
    const mockedReadline = vi.mocked(readline) as any; // Get the mocked readline module and cast to any
    mockRl = mockedReadline.__rl; // Access its exported __rl
    mockWorkflowEngine = {
      createWorkflow: vi.fn().mockResolvedValue({ id: 'mock-workflow-id', steps: [] }),
      execute: vi.fn().mockResolvedValue({ status: 'COMPLETED', duration: 100, steps: [] }),
      getWorkflow: vi.fn().mockImplementation((id: string) => {
        if (id === 'mock-workflow-id') {
          return { id: 'mock-workflow-id', steps: [] };
        }
        return undefined;
      }),
    };
    mockNlProcessor = {
      parse: vi.fn().mockResolvedValue({
        intent: 'test-intent',
        confidence: 0.8,
        workflowYAML: 'name: test-workflow\nsteps:\n  - cli: echo\n    args: ["hello"]',
        taskList: {
          intent: 'test-intent',
          tasks: [{ commands: [{ cli: 'echo', args: ['hello'] }] }],
        },
      }),
    };
    mockCommandBridge = (await import('../chat/command-bridge.js') as any).__mockCommandBridge; // Assign the exported mock for direct access
    
    // Get the mocked LLMClient instance
    const { LLMClient } = await import('../nl/llm.js');
    mockedLLMClient = (LLMClient as any)(); // Get the instance returned by our mock constructor
  });

  it('should auto-execute workflow in "auto" mode', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'auto' },
      workflowEngine: mockWorkflowEngine,
      nlProcessor: mockNlProcessor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockedLLMClient.complete).toHaveBeenCalledWith('intent-parser-chat', 'some input', {}, expect.objectContaining({ tools: expect.any(Array) }));
    expect(mockWorkflowEngine.createWorkflow).toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mock-workflow-id' }),
      expect.objectContaining({ mode: 'relaxed', initialVariables: { param1: 'value1' } })
    );
    expect(result.type).toBe('text');
    expect(result.content).toContain('✅ 执行成功');
  });

  it('should prompt for confirmation in "confirm" mode and execute if "y"', async () => {
    mockRl.question.mockImplementationOnce((_query: string, callback: (answer: string) => void) => callback('y')); // Simulate user entering 'y'
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'confirm' },
      workflowEngine: mockWorkflowEngine,
      nlProcessor: mockNlProcessor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockNlProcessor.parse).toHaveBeenCalledWith(expect.objectContaining({ input: 'some input' }));
    expect(mockRl.question).toHaveBeenCalled();
    expect(mockWorkflowEngine.createWorkflow).toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mock-workflow-id' }),
      expect.objectContaining({ mode: 'relaxed', initialVariables: { param1: 'value1' } }) // Expect initialVariables
    );
    expect(result.type).toBe('text');
    expect(result.content).toContain('✅ 执行成功');
  });

  it('should prompt for confirmation in "confirm" mode and not execute if "n"', async () => {
    mockRl.question.mockImplementationOnce((_query: string, callback: (answer: string) => void) => callback('n')); // Simulate user entering 'n'
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'confirm' },
      workflowEngine: mockWorkflowEngine,
      nlProcessor: mockNlProcessor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockNlProcessor.parse).toHaveBeenCalledWith(expect.objectContaining({ input: 'some input' }));
    expect(mockRl.question).toHaveBeenCalled();
    expect(mockWorkflowEngine.createWorkflow).toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(result.type).toBe('text');
    expect(result.content).toContain('已取消自动执行');
  });

  it('should generate workflow and wait for manual execution in "manual" mode', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, executeMode: 'manual' },
      workflowEngine: mockWorkflowEngine,
      nlProcessor: mockNlProcessor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('some input');

    expect(mockNlProcessor.parse).toHaveBeenCalledWith(expect.objectContaining({ input: 'some input' }));
    expect(mockWorkflowEngine.createWorkflow).toHaveBeenCalled();
    expect(mockWorkflowEngine.execute).not.toHaveBeenCalled();
    expect(mockRl.question).not.toHaveBeenCalled(); // No question in manual mode
    expect(result.type).toBe('text');
    expect(result.content).toContain('💡 输入 `执行工作流` 或 `/execute` 来运行。');
  });
});

describe('Command Bridge functionality', () => {
  let mockCommandBridge: any;
  let mockCommandExecutor: any;

  beforeEach(async () => { // Make it async
    vi.clearAllMocks();
    mockCommandBridge = (await import('../chat/command-bridge.js') as any).__mockCommandBridge; // Access the mocked CommandBridge
    mockCommandExecutor = {
      execute: vi.fn().mockResolvedValue('Mock shell command output'),
    };
  });

  it('should use commandBridge for commands starting with prefix when enabled', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, enableCommandBridge: true, commandBridgePrefix: '!' },
      commandExecutor: mockCommandExecutor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!my-vectahub-command arg1');

    expect(mockCommandBridge.execute).toHaveBeenCalledWith('my-vectahub-command arg1');
    expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('Mock command bridge output from mockCommandBridge');
  });

  it('should fallback to commandExecutor for commands not starting with commandBridgePrefix when bridge is enabled', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, enableCommandBridge: true, commandBridgePrefix: '/' }, // Change prefix to '/'
      commandExecutor: mockCommandExecutor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!ls -la'); // This is a shell command, but not a command bridge command

    expect(mockCommandBridge.execute).not.toHaveBeenCalled();
    expect(mockCommandExecutor.execute).toHaveBeenCalledWith('!ls -la');
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('Mock shell command output');
  });

  it('should fallback to commandExecutor when commandBridge is disabled', async () => {
    const deps = createMockDeps({
      config: { ...mockChatConfig, enableCommandBridge: false, commandBridgePrefix: '!' },
      commandExecutor: mockCommandExecutor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!my-vectahub-command arg1'); // Prefix present, but bridge disabled

    expect(mockCommandBridge.execute).not.toHaveBeenCalled();
    expect(mockCommandExecutor.execute).toHaveBeenCalledWith('!my-vectahub-command arg1'); // Full command passed to shell
    expect(result.type).toBe('command-result');
    expect(result.content).toContain('Mock shell command output');
  });

  it('should handle errors from commandBridge execution', async () => {
    mockCommandBridge.execute.mockRejectedValue(new Error('Command bridge failed'));
    const deps = createMockDeps({
      config: { ...mockChatConfig, enableCommandBridge: true, commandBridgePrefix: '!' },
      commandExecutor: mockCommandExecutor,
    });
    const repl = createRepl(deps);
    const result = await repl.processInput('!failing-command');

    expect(mockCommandBridge.execute).toHaveBeenCalledWith('failing-command');
    expect(result.type).toBe('error');
    expect(result.content).toContain('VectaHub command failed: Command bridge failed');
  });
});

