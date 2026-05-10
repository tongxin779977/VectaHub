import type { PromptManager } from './prompt-manager.js';
import type { SessionManager } from './session-manager.js';
import type { LLMConfig, LLMTool, LLMToolCall, LLMResponse as LLMClientResponse } from './llm.js';
import { LLMClient } from './llm.js';
import { DEFAULT_INTENT_PARSER_ID } from './prompt-manager.js';

export interface LLMOrchestratorOptions {
  promptManager: PromptManager;
  sessionManager: SessionManager;
  llmConfig: LLMConfig;
  llmClient?: LLMClient;
}

export interface LLMRequest {
  input: string;
  sessionId?: string;
  promptId?: string;
  tools?: LLMTool[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  intent?: string;
  confidence?: number;
  params?: Record<string, unknown>;
  toolCalls?: LLMToolCall[];
  traceId: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface LLMTrace {
  traceId: string;
  sessionId?: string;
  timestamp: Date;
  userInput: string;
  systemPrompt: string;
  rawResponse: string;
  intent?: string;
  confidence?: number;
  toolCalls?: LLMToolCall[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

class LLMOrchestratorImpl {
  private promptManager: PromptManager;
  private sessionManager: SessionManager;
  private llmConfig: LLMConfig;
  private llmClient: LLMClient;
  private traces: Map<string, LLMTrace> = new Map();
  private maxTraces = 100;

  constructor(options: LLMOrchestratorOptions) {
    this.promptManager = options.promptManager;
    this.sessionManager = options.sessionManager;
    this.llmConfig = options.llmConfig;
    this.llmClient = options.llmClient ?? new LLMClient(this.llmConfig);
  }

  async ask(request: LLMRequest): Promise<LLMResponse> {
    const traceId = this.generateTraceId();
    const startTime = Date.now();

    const trace: LLMTrace = {
      traceId,
      sessionId: request.sessionId,
      timestamp: new Date(),
      userInput: request.input,
      systemPrompt: '',
      rawResponse: '',
      status: 'success',
      latencyMs: 0,
    };

    try {
      const sessionId = request.sessionId ?? 'default';
      this.sessionManager.getOrCreateSession(sessionId);

      const promptId = request.promptId ?? this.selectPrompt(request.input);
      const systemPrompt = this.promptManager.buildSystemPrompt(
        promptId,
        { userInput: request.input },
        sessionId
      );

      trace.systemPrompt = systemPrompt;

      const context = this.sessionManager.buildContextAwarePrompt('', sessionId);

      const llmResponse: LLMClientResponse = await this.llmClient.complete(
        promptId,
        request.input,
        { userInput: request.input },
        {
          tools: request.tools,
          toolChoice: request.tools ? 'auto' : undefined,
        }
      );

      const latencyMs = Date.now() - startTime;
      trace.latencyMs = latencyMs;

      const response: LLMResponse = {
        content: JSON.stringify(llmResponse),
        intent: llmResponse.intent,
        confidence: llmResponse.confidence,
        params: llmResponse.params,
        toolCalls: llmResponse.tool_calls,
        traceId,
        latencyMs,
      };

      if (llmResponse.usage) {
        response.tokenUsage = llmResponse.usage;
        trace.tokenUsage = llmResponse.usage;
      }

      trace.rawResponse = response.content;
      trace.intent = response.intent;
      trace.confidence = response.confidence;
      trace.toolCalls = response.toolCalls;

      this.recordTrace(trace);

      return response;
    } catch (error) {
      trace.status = 'error';
      trace.latencyMs = Date.now() - startTime;
      trace.errorMessage = error instanceof Error ? error.message : String(error);
      this.recordTrace(trace);

      throw error;
    }
  }

  getTrace(traceId: string): LLMTrace | undefined {
    return this.traces.get(traceId);
  }

  getRecentTraces(limit: number = 10): LLMTrace[] {
    const allTraces = Array.from(this.traces.values());
    return allTraces.slice(-limit);
  }

  private selectPrompt(input: string): string {
    const prompt = this.promptManager.selectPrompt({
      action: input,
    });
    return prompt?.id ?? DEFAULT_INTENT_PARSER_ID;
  }

  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private recordTrace(trace: LLMTrace): void {
    this.traces.set(trace.traceId, trace);

    if (this.traces.size > this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      if (oldestKey) {
        this.traces.delete(oldestKey);
      }
    }
  }
}

export function createLLMOrchestrator(options: LLMOrchestratorOptions): LLMOrchestratorImpl {
  return new LLMOrchestratorImpl(options);
}
