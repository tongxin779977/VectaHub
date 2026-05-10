import type { PromptManager } from './prompt-manager.js';
import type { SessionManager } from './session-manager.js';
import type { LLMConfig, LLMTool, LLMToolCall, LLMResponse as LLMClientResponse } from './llm.js';
import { LLMClient } from './llm.js';
import { DEFAULT_INTENT_PARSER_ID } from './prompt-manager.js';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('llm-orchestrator');

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

export interface ContextStructure {
  l1WorkingMemory: number;
  l2SessionSummary: number;
  l3ProjectContext: number;
  totalTokens: number;
  formattedContext: string;
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
  contextStructure?: ContextStructure;
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

      const tokenBreakdown = this.sessionManager.getTokenBreakdown(sessionId);
      const formattedContext = this.sessionManager.getFormattedContext(sessionId);
      trace.contextStructure = {
        l1WorkingMemory: tokenBreakdown.l1,
        l2SessionSummary: tokenBreakdown.l2,
        l3ProjectContext: tokenBreakdown.l3,
        totalTokens: tokenBreakdown.total,
        formattedContext,
      };

      this.sessionManager.buildContextAwarePrompt('', sessionId);

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
      this.logTraceCompletion(trace);

      return response;
    } catch (error) {
      trace.status = 'error';
      trace.latencyMs = Date.now() - startTime;
      trace.errorMessage = error instanceof Error ? error.message : String(error);
      this.recordTrace(trace);
      this.logTraceCompletion(trace);

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
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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

  private logTraceCompletion(trace: LLMTrace): void {
    const logPayload = {
      traceId: trace.traceId,
      sessionId: trace.sessionId,
      status: trace.status,
      latencyMs: trace.latencyMs,
      intent: trace.intent,
      confidence: trace.confidence,
      tokenUsage: trace.tokenUsage,
      contextTokens: trace.contextStructure?.totalTokens,
    };

    if (trace.status === 'error') {
      logger.error({ ...logPayload, errorMessage: trace.errorMessage }, `LLM trace FAILED: ${trace.traceId}`);
    } else {
      logger.info(logPayload, `LLM trace completed: ${trace.traceId}`);
    }
  }

  printTrace(traceId: string): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return `[LLMTrace] No trace found for: ${traceId}`;
    }

    const lines = [
      `┌─ LLM Trace Debug ─────────────────────────────────────`,
      `│ traceId:    ${trace.traceId}`,
      `│ sessionId:  ${trace.sessionId ?? 'N/A'}`,
      `│ timestamp:  ${trace.timestamp.toISOString()}`,
      `│ status:     ${trace.status}`,
      `│ latencyMs:  ${trace.latencyMs}`,
      `│ intent:     ${trace.intent ?? 'N/A'}`,
      `│ confidence: ${trace.confidence ?? 'N/A'}`,
    ];

    if (trace.tokenUsage) {
      lines.push(`│ tokenUsage: prompt=${trace.tokenUsage.promptTokens}, completion=${trace.tokenUsage.completionTokens}, total=${trace.tokenUsage.totalTokens}`);
    }

    if (trace.contextStructure) {
      lines.push(`│ contextStructure:`);
      lines.push(`│   L1 (workingMemory):  ${trace.contextStructure.l1WorkingMemory} tokens`);
      lines.push(`│   L2 (sessionSummary): ${trace.contextStructure.l2SessionSummary} tokens`);
      lines.push(`│   L3 (projectContext): ${trace.contextStructure.l3ProjectContext} tokens`);
      lines.push(`│   total:               ${trace.contextStructure.totalTokens} tokens`);
    }

    if (trace.toolCalls && trace.toolCalls.length > 0) {
      lines.push(`│ toolCalls:`);
      for (const tc of trace.toolCalls) {
        lines.push(`│   - ${tc.function.name}(${tc.function.arguments})`);
      }
    }

    if (trace.errorMessage) {
      lines.push(`│ error: ${trace.errorMessage}`);
    }

    lines.push(`└──────────────────────────────────────────────────────`);
    return lines.join('\n');
  }
}

export function createLLMOrchestrator(options: LLMOrchestratorOptions): LLMOrchestratorImpl {
  return new LLMOrchestratorImpl(options);
}
