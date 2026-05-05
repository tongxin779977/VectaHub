import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentDelegateModule } from './agent-loop.js';
import { createAIModuleRegistry } from '../registry.js';
import { BUILTIN_AGENT_TOOLS, agentToolsToLLMTools } from './agent-tools.js';
import { createExecutor } from '../../../workflow/executor.js';
import type { Step } from '../../../types/index.js';
import type { AIModuleContext, AIModuleResult } from '../types.js';
import type { DelegateStepResult } from './types.js';
import type { LLMResponse, LLMToolCall } from '../../../nl/llm.js';
import type { Detector } from '../../../sandbox/detector.js';

function createMockLLMClient(responses: LLMResponse[]) {
  let callIndex = 0;
  return {
    complete: vi.fn(async () => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return response;
    }),
  };
}

function createMockDetector(overrides?: Partial<Detector>): Detector {
  const detectResult = { isDangerous: false, level: 'none' as const };
  return {
    detect: vi.fn(() => detectResult),
    isDangerous: vi.fn(() => false),
    getDangerLevel: vi.fn(() => ({ level: 'none' as const })),
    ...overrides,
  };
}

function makeToolCall(toolName: string, args: Record<string, unknown>): LLMToolCall {
  return {
    id: `call_${toolName}`,
    type: 'function',
    function: {
      name: toolName,
      arguments: JSON.stringify(args),
    },
  };
}

function makePlainTextResponse(text: string): LLMResponse {
  return {
    intent: 'UNKNOWN',
    confidence: 0,
    params: { text },
    workflow: { name: '', steps: [] },
  };
}

function makeToolCallResponse(toolCalls: LLMToolCall[]): LLMResponse {
  return {
    intent: 'UNKNOWN',
    confidence: 0,
    params: {},
    workflow: { name: '', steps: [] },
    tool_calls: toolCalls,
  };
}

describe('AgentDelegateModule', () => {
  describe('module registration in AIModuleRegistry', () => {
    it('should register and retrieve from registry', () => {
      const registry = createAIModuleRegistry();
      const llmClient = createMockLLMClient([]);
      const module = createAgentDelegateModule({ llmClient: llmClient as any });
      registry.register(module);

      expect(registry.get('vectahub.agent-delegate')).toBe(module);
      expect(module.id).toBe('vectahub.agent-delegate');
      expect(module.name).toBe('Agent Delegate');
      expect(module.type).toBe('ai-enhancement');
    });
  });

  describe('canHandle', () => {
    it('should return false when no LLM client', async () => {
      const module = createAgentDelegateModule();
      const context: AIModuleContext = { delegateTo: 'gemini' };
      expect(await module.canHandle(context)).toBe(false);
    });

    it('should return false when delegateTo is not set', async () => {
      const llmClient = createMockLLMClient([]);
      const module = createAgentDelegateModule({ llmClient: llmClient as any });
      const context: AIModuleContext = { userInput: 'hello' };
      expect(await module.canHandle(context)).toBe(false);
    });

    it('should return true when delegateTo is set and LLM available', async () => {
      const llmClient = createMockLLMClient([]);
      const module = createAgentDelegateModule({ llmClient: llmClient as any });
      const context: AIModuleContext = { delegateTo: 'gemini' };
      expect(await module.canHandle(context)).toBe(true);
    });
  });

  describe('agent loop - 1 turn final answer', () => {
    it('should return completed when LLM returns plain text immediately', async () => {
      const llmClient = createMockLLMClient([
        makePlainTextResponse('The answer is 42'),
      ]);
      const module = createAgentDelegateModule({ llmClient: llmClient as any });
      const context: AIModuleContext = { delegateTo: 'gemini', userInput: 'What is the answer?' };

      const result: AIModuleResult<DelegateStepResult> = await module.execute('What is the answer?', context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('completed');
      expect(result.data?.output).toBe('The answer is 42');
      expect(result.data?.toolCalls).toEqual([]);
    });
  });

  describe('agent loop - multi-turn with tool call', () => {
    it('should execute tool call then return final answer', async () => {
      const readResult = 'file contents here';
      const llmClient = createMockLLMClient([
        makeToolCallResponse([
          makeToolCall('read_file', { path: '/tmp/test.txt' }),
        ]),
        makePlainTextResponse('The file contains: file contents here'),
      ]);

      const detector = createMockDetector();
      const module = createAgentDelegateModule({
        llmClient: llmClient as any,
        detector,
      });
      const context: AIModuleContext = { delegateTo: 'gemini', userInput: 'Read the file' };

      const result: AIModuleResult<DelegateStepResult> = await module.execute('Read the file', context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('completed');
      expect(result.data?.toolCalls).toHaveLength(1);
      expect(result.data?.toolCalls[0].toolName).toBe('read_file');
    });
  });

  describe('agent loop - maxTurns exceeded', () => {
    it('should return exceeded_max_turns when loop exceeds limit', async () => {
      const llmClient = createMockLLMClient([
        makeToolCallResponse([makeToolCall('read_file', { path: '/tmp/a' })]),
        makeToolCallResponse([makeToolCall('read_file', { path: '/tmp/b' })]),
        makeToolCallResponse([makeToolCall('read_file', { path: '/tmp/c' })]),
        makeToolCallResponse([makeToolCall('read_file', { path: '/tmp/d' })]),
        makeToolCallResponse([makeToolCall('read_file', { path: '/tmp/e' })]),
      ]);

      const detector = createMockDetector();
      const module = createAgentDelegateModule({
        llmClient: llmClient as any,
        detector,
        maxTurns: 3,
      });
      const context: AIModuleContext = { delegateTo: 'gemini' };

      const result: AIModuleResult<DelegateStepResult> = await module.execute('keep reading', context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('exceeded_max_turns');
    });
  });

  describe('dangerous command blocked by detector', () => {
    it('should block tool call when detector flags danger', async () => {
      const llmClient = createMockLLMClient([
        makeToolCallResponse([
          makeToolCall('execute_command', { command: 'rm -rf /' }),
        ]),
        makePlainTextResponse('I cannot execute that command'),
      ]);

      const detector = createMockDetector({
        detect: vi.fn(() => ({
          isDangerous: true,
          level: 'critical' as const,
          reason: 'Critical system modification detected',
        })),
      });

      const module = createAgentDelegateModule({
        llmClient: llmClient as any,
        detector,
      });
      const context: AIModuleContext = { delegateTo: 'gemini' };

      const result: AIModuleResult<DelegateStepResult> = await module.execute('delete everything', context);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('completed');
    });
  });

  describe('executor delegate step validation', () => {
    it('should validate delegate step with delegateTo and delegatePrompt', () => {
      const executor = createExecutor();
      const step: Step = {
        id: 'del1',
        type: 'delegate',
        delegateTo: 'gemini',
        delegatePrompt: 'analyze the code',
      };
      const result = executor.validateStep(step);
      expect(result.valid).toBe(true);
    });

    it('should reject delegate step without delegateTo', () => {
      const executor = createExecutor();
      const step = {
        id: 'del1',
        type: 'delegate' as const,
        delegatePrompt: 'analyze the code',
      };
      const result = executor.validateStep(step as Step);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('delegate step must have delegateTo and delegatePrompt');
    });

    it('should reject delegate step without delegatePrompt', () => {
      const executor = createExecutor();
      const step = {
        id: 'del1',
        type: 'delegate' as const,
        delegateTo: 'gemini',
      };
      const result = executor.validateStep(step as Step);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('delegate step must have delegateTo and delegatePrompt');
    });
  });

  describe('executor registerStepHandler', () => {
    it('should register and use custom step handler for delegate type', async () => {
      const executor = createExecutor() as any;
      const mockResult = {
        stepId: 'del1',
        status: 'COMPLETED' as const,
        output: ['delegated result'],
        duration: 100,
      };

      executor.registerStepHandler('delegate', async () => mockResult);

      const step: Step = {
        id: 'del1',
        type: 'delegate',
        delegateTo: 'gemini',
        delegatePrompt: 'do something',
      };

      const result = await executor.execute(step, { mode: 'RELAXED' });
      expect(result.status).toBe('COMPLETED');
      expect(result.output).toEqual(['delegated result']);
    });

    it('should return FAILED for delegate step without registered handler', async () => {
      const executor = createExecutor();
      const step: Step = {
        id: 'del1',
        type: 'delegate',
        delegateTo: 'gemini',
        delegatePrompt: 'do something',
      };

      const result = await executor.execute(step, { mode: 'RELAXED' });
      expect(result.status).toBe('FAILED');
    });
  });
});

describe('agentToolsToLLMTools', () => {
  it('should convert AgentToolDefinition[] to LLMTool[]', () => {
    const llmTools = agentToolsToLLMTools(BUILTIN_AGENT_TOOLS);
    expect(llmTools).toHaveLength(4);
    expect(llmTools[0].type).toBe('function');
    expect(llmTools[0].function.name).toBe('execute_command');
    expect(llmTools[1].function.name).toBe('read_file');
    expect(llmTools[2].function.name).toBe('write_file');
    expect(llmTools[3].function.name).toBe('search_files');
  });
});

describe('BUILTIN_AGENT_TOOLS', () => {
  it('should define 4 tools with correct security flags', () => {
    expect(BUILTIN_AGENT_TOOLS).toHaveLength(4);
    const securityMap = Object.fromEntries(
      BUILTIN_AGENT_TOOLS.map(t => [t.name, t.requiresSecurityCheck])
    );
    expect(securityMap['execute_command']).toBe(true);
    expect(securityMap['read_file']).toBe(false);
    expect(securityMap['write_file']).toBe(true);
    expect(securityMap['search_files']).toBe(false);
  });
});
