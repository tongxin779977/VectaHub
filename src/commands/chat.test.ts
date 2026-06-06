import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeRouterMock = vi.fn();
const processInputMock = vi.fn();
const createLLMConfigMock = vi.fn();
const createInterfaceMock = vi.fn();

vi.mock('../nl/orchestrator.js', () => ({
  initializeRouter: initializeRouterMock,
  processInput: processInputMock,
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

describe('chat command', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
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
    processInputMock.mockResolvedValue({
      success: true,
      intent: 'RUN_SCRIPT',
      confidence: 0.9,
      taskList: { tasks: [] },
      metadata: {},
    });

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(createLLMConfigMock).toHaveBeenCalled();
    expect(processInputMock).toHaveBeenCalledWith(
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
});
