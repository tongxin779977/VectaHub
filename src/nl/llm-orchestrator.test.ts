import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLMOrchestrator } from './llm-orchestrator.js';
import type { PromptManager } from './prompt-manager.js';
import type { SessionManager } from './session-manager.js';
import type { LLMConfig, LLMTool } from './llm.js';

describe('LLMOrchestrator', () => {
  let mockPromptManager: PromptManager;
  let mockSessionManager: SessionManager;
  let mockLLMConfig: LLMConfig;
  let mockLLMClient: {
    complete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPromptManager = {
      get: vi.fn().mockReturnValue({
        id: 'test-prompt',
        systemTemplate: 'Test system prompt',
        metadata: { uses: 0, effectiveness: 0.8 },
      }),
      buildSystemPrompt: vi.fn().mockReturnValue('Built system prompt'),
      selectPrompt: vi.fn().mockReturnValue({ id: 'default-prompt' }),
      recordOutcome: vi.fn(),
    } as any;

    mockSessionManager = {
      getOrCreateSession: vi.fn().mockReturnValue({
        sessionId: 'test-session',
        history: [],
        userPreferences: { executionMode: 'relaxed' },
        projectContext: { cwd: '/test' },
        recentActions: [],
      }),
      buildContextAwarePrompt: vi.fn().mockReturnValue('Context aware prompt'),
      addUserMessage: vi.fn(),
      addAssistantMessage: vi.fn(),
    } as any;

    mockLLMConfig = {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    };

    mockLLMClient = {
      complete: vi.fn().mockResolvedValue({
        intent: 'TEST_INTENT',
        confidence: 0.9,
        params: {},
        workflow: { name: 'test', steps: [] },
      }),
    };
  });

  describe('ask()', () => {
    it('should call promptManager, sessionManager and llmClient', async () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      const result = await orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
        promptId: 'test-prompt',
      });

      expect(mockPromptManager.buildSystemPrompt).toHaveBeenCalled();
      expect(mockSessionManager.buildContextAwarePrompt).toHaveBeenCalled();
      expect(mockLLMClient.complete).toHaveBeenCalled();
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('traceId');
      expect(result).toHaveProperty('latencyMs');
    });

    it('should use default prompt when promptId is not provided', async () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      await orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
      });

      expect(mockPromptManager.selectPrompt).toHaveBeenCalled();
    });

    it('should throw error when LLM call fails', async () => {
      mockLLMClient.complete.mockRejectedValue(new Error('LLM API error'));

      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      await expect(orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
      })).rejects.toThrow('LLM API error');
    });

    it('should return traceId and latencyMs', async () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      const result = await orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
      });

      expect(result.traceId).toBeDefined();
      expect(result.traceId).toMatch(/^trace-/);
      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass tools to LLM call', async () => {
      const tools: LLMTool[] = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      await orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
        tools,
      });

      expect(mockLLMClient.complete).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ tools })
      );
    });

    it('should return tokenUsage when available', async () => {
      mockLLMClient.complete.mockResolvedValue({
        intent: 'TEST_INTENT',
        confidence: 0.9,
        params: {},
        workflow: { name: 'test', steps: [] },
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      const result = await orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
      });

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.totalTokens).toBe(150);
    });
  });

  describe('getTrace()', () => {
    it('should return trace by traceId', async () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      const result = await orchestrator.ask({
        input: 'test input',
        sessionId: 'test-session',
      });

      const trace = orchestrator.getTrace(result.traceId);
      expect(trace).toBeDefined();
      expect(trace?.traceId).toBe(result.traceId);
      expect(trace?.userInput).toBe('test input');
    });

    it('should return undefined for non-existent traceId', () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      const trace = orchestrator.getTrace('non-existent-trace');
      expect(trace).toBeUndefined();
    });
  });

  describe('getRecentTraces()', () => {
    it('should return recent traces', async () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      await orchestrator.ask({ input: 'test 1', sessionId: 's1' });
      await orchestrator.ask({ input: 'test 2', sessionId: 's2' });

      const traces = orchestrator.getRecentTraces(10);
      expect(traces).toHaveLength(2);
      expect(traces[0].userInput).toBe('test 1');
      expect(traces[1].userInput).toBe('test 2');
    });

    it('should limit traces count', async () => {
      const orchestrator = createLLMOrchestrator({
        promptManager: mockPromptManager,
        sessionManager: mockSessionManager,
        llmConfig: mockLLMConfig,
        llmClient: mockLLMClient as any,
      });

      for (let i = 0; i < 5; i++) {
        await orchestrator.ask({ input: `test ${i}`, sessionId: `s${i}` });
      }

      const traces = orchestrator.getRecentTraces(3);
      expect(traces).toHaveLength(3);
    });
  });
});
