import type { AuditHelper } from '../infrastructure/audit/index.js';
import { getAllIntentNames, buildKeywordSummary } from './templates/index.js';
import createLLMDialogControlSkill from '../skills/llm-dialog-control/index.js';
import { loadConfig } from '../setup/first-run-wizard-bridge.js';
import {
  createPromptManager,
  DEFAULT_INTENT_PARSER_ID,
  DEFAULT_WORKFLOW_YAML_ID,
} from './prompt-manager.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import type {
  LLMConfig,
  LLMTool,
  LLMToolCall,
  LLMWorkflowStepInline,
  LLMResponse,
} from './interfaces.js';

export type { LLMConfig, LLMTool, LLMToolCall, LLMWorkflowStepInline, LLMResponse };

/**
 * LLM 客户端依赖注入接口
 */
export interface LLMClientDeps {
  auditHelper: AuditHelper;
}

const INTENT_LIST = getAllIntentNames();
const SUPPORTED_LLM_PROVIDERS = ['openai', 'anthropic', 'ollama', 'groq'] as const;
const DEFAULT_LLM_TEMPERATURE = 0.1;

interface ResolvedLLMConfigSource {
  provider: LLMConfig['provider'];
  apiKey?: string;
  baseUrl?: string;
  model: string;
  timeout?: number;
}

export type LLMConfigState = 'unconfigured' | 'configured' | 'invalid';

export interface LLMConfigResolution {
  state: LLMConfigState;
  config: LLMConfig | null;
  error?: VectaHubError;
}

function normalizeLLMProvider(provider: string | undefined): LLMConfig['provider'] | null {
  const normalized = provider?.toLowerCase();
  if (!normalized) return null;
  return (SUPPORTED_LLM_PROVIDERS as readonly string[]).includes(normalized)
    ? normalized as LLMConfig['provider']
    : null;
}

function getConfiguredLLMTemperature(): number {
  const raw = process.env.VECTAHUB_LLM_TEMPERATURE;
  const parsed = raw !== undefined ? Number.parseFloat(raw) : DEFAULT_LLM_TEMPERATURE;
  return Number.isFinite(parsed) ? parsed : DEFAULT_LLM_TEMPERATURE;
}

function resolveConfigFileLLMSource(): ResolvedLLMConfigSource | null {
  const config = loadConfig();
  const llmConfig = config.ai_providers?.vectahub_llm;

  if (!llmConfig?.enabled) return null;
  const provider = normalizeLLMProvider(llmConfig.provider);
  if (!provider) {
    throw new VectaHubError(
      `Unsupported LLM provider in config: ${llmConfig.provider || '(empty)'}`,
      ErrorType.CONFIGURATION,
    );
  }

  let apiKey = llmConfig.apiKey;
  let baseUrl = llmConfig.baseUrl;

  if (!apiKey) {
    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === 'anthropic') {
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else if (provider === 'groq') {
      apiKey = process.env.GROQ_API_KEY;
    } else if (provider === 'ollama') {
      apiKey = process.env.OLLAMA_API_KEY;
    }
  }

  if (!baseUrl) {
    if (provider === 'groq') {
      baseUrl = 'https://api.groq.com/openai/v1';
    } else if (provider === 'ollama') {
      baseUrl = 'http://localhost:11434/v1';
    } else if (provider === 'openai') {
      baseUrl = 'https://api.openai.com/v1';
    }
  } else if (provider === 'openai' && !baseUrl.endsWith('/v1')) {
    // 如果配置了自定义 baseUrl（如 DeepSeek），确保它以 /v1 结尾
    baseUrl = baseUrl.replace(/\/?$/, '/v1');
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model: llmConfig.model || getDefaultModel(provider),
    timeout: llmConfig.timeout_ms,
  };
}

function resolveEnvLLMSource(): ResolvedLLMConfigSource | null {
  const explicitProvider = process.env.VECTAHUB_LLM_PROVIDER;
  const normalizedExplicitProvider = normalizeLLMProvider(explicitProvider);
  if (explicitProvider && !normalizedExplicitProvider) {
    throw new VectaHubError(
      `Unsupported LLM provider: ${explicitProvider}`,
      ErrorType.CONFIGURATION,
    );
  }

  const hasEnvSignal = Boolean(
    explicitProvider
    || process.env.VECTAHUB_LLM_MODEL
    || process.env.VECTAHUB_LLM_BASE_URL
    || process.env.OPENAI_API_KEY,
  );
  if (!hasEnvSignal) return null;

  const provider = normalizedExplicitProvider || 'openai';
  const model = process.env.VECTAHUB_LLM_MODEL || getDefaultModel(provider);
  let baseUrl = process.env.VECTAHUB_LLM_BASE_URL;
  let apiKey: string | undefined;

  if (provider === 'openai') {
    apiKey = process.env.OPENAI_API_KEY;
    if (!baseUrl) baseUrl = 'https://api.openai.com/v1';
  } else if (provider === 'anthropic') {
    apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (provider === 'groq') {
    apiKey = process.env.GROQ_API_KEY;
    if (!baseUrl) baseUrl = 'https://api.groq.com/openai/v1';
  } else if (provider === 'ollama') {
    apiKey = process.env.OLLAMA_API_KEY;
    if (!baseUrl) baseUrl = 'http://localhost:11434/v1';
  }

  return {
    provider,
    model,
    baseUrl,
    apiKey,
  };
}

function resolveLLMConfigSource(): ResolvedLLMConfigSource | null {
  return resolveConfigFileLLMSource() || resolveEnvLLMSource();
}

export function resolveLLMConfig(): LLMConfigResolution {
  const resolved = resolveLLMConfigSource();
  if (!resolved) {
    return {
      state: 'unconfigured',
      config: null,
    };
  }

  if ((resolved.provider === 'openai' || resolved.provider === 'groq' || resolved.provider === 'anthropic') && !resolved.apiKey) {
    return {
      state: 'invalid',
      config: null,
      error: new VectaHubError(
        `Missing API key for LLM provider: ${resolved.provider}`,
        ErrorType.CONFIGURATION,
      ),
    };
  }

  return {
    state: 'configured',
    config: resolved,
  };
}

export function createLLMConfigDigestSource(): {
  provider: LLMConfig['provider'];
  model: string;
  temperature: number;
} | null {
  const source = resolveLLMConfigSource();
  if (!source) return null;
  return {
    provider: source.provider,
    model: source.model,
    temperature: getConfiguredLLMTemperature(),
  };
}

export class LLMClient {
  private config: LLMConfig;
  private sessionId?: string;
  private promptManager;
  private embeddingCache: Map<string, number[]> = new Map();
  private auditHelper: AuditHelper;

  constructor(config: LLMConfig, deps: LLMClientDeps) {
    this.config = config;
    this.promptManager = createPromptManager();
    this.auditHelper = deps.auditHelper;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    // 确保创建会话
    this.promptManager.sessionManager.getOrCreateSession(sessionId);
  }

  // 便捷访问会话管理器
  get sessionManager() {
    return this.promptManager.sessionManager;
  }

  async complete(promptId: string, userInput: string, context?: Record<string, string>, options?: { tools?: LLMTool[]; toolChoice?: string }): Promise<LLMResponse> {
    try {
      const systemPrompt = this.promptManager.buildSystemPrompt(promptId, context, this.sessionId);
      // 记录用户消息
      if (this.sessionId) {
        this.promptManager.sessionManager.addUserMessage(this.sessionId, userInput);
      }
      let response: Response;

      if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
        response = await this.callOpenAICompatible(userInput, systemPrompt, options?.tools, options?.toolChoice);
      } else if (this.config.provider === 'anthropic') {
        response = await this.callAnthropic(userInput, systemPrompt, options?.tools);
      } else {
        throw new Error(`Unsupported provider: ${this.config.provider}`);
      }

      const data = await response.json();
      this.auditHelper.securityAction('LLM_CALL', `${this.config.provider}/${this.config.model}`, 'COMPLETED', this.sessionId || 'unknown');

      return this.parseResponse(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.auditHelper.securityAction('LLM_CALL', `${this.config.provider}/${this.config.model}`, 'FAILED', this.sessionId || 'unknown');

      throw new Error(`LLM call failed: ${errorMessage}`, { cause: error });
    }
  }

  private async callOpenAICompatible(userInput: string, systemPrompt: string, tools?: LLMTool[], toolChoice?: string): Promise<Response> {
    const apiKey = this.config.apiKey;
    const baseUrl = this.config.baseUrl;

    if (!baseUrl) {
      throw new Error('Base URL is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const useToolCalling = tools && tools.length > 0;
      const requestBody: Record<string, unknown> = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        temperature: 0.1,
      };

      if (useToolCalling) {
        requestBody.tools = tools;
      } else {
        const systemContent = systemPrompt.includes('json')
          ? systemPrompt
          : systemPrompt + '\n\nPlease respond in JSON format.';
        (requestBody.messages as Array<Record<string, string>>)[0].content = systemContent;
        requestBody.response_format = { type: 'json_object' };
      }
      if (toolChoice) {
        requestBody.tool_choice = toolChoice;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callAnthropic(userInput: string, systemPrompt: string, tools?: LLMTool[]): Promise<Response> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new Error('API key is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestBody: Record<string, unknown> = {
        model: this.config.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userInput },
        ],
      };

      if (tools) {
        requestBody.tools = tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters,
        }));
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(data: unknown): LLMResponse {
    let content: string;
    let toolCalls: LLMToolCall[] | undefined;

    if (this.config.provider === 'anthropic') {
      const anthropicData = data as { content?: { text?: string; type?: string }[] };
      content = anthropicData.content?.[0]?.text || '';
    } else {
      const openAIData = data as { choices?: { message?: { content?: string; tool_calls?: LLMToolCall[] } }[] };
      content = openAIData.choices?.[0]?.message?.content || '';
      toolCalls = openAIData.choices?.[0]?.message?.tool_calls;
    }

    // 当存在 tool_calls 时直接返回，无需解析 content 为 JSON
    if (toolCalls && toolCalls.length > 0) {
      return {
        intent: 'UNKNOWN',
        confidence: 0,
        params: {},
        workflow: { name: '', steps: [] },
        tool_calls: toolCalls,
      };
    }

    // 记录助手消息
    if (this.sessionId && content) {
      this.promptManager.sessionManager.addAssistantMessage(this.sessionId, content);
    }

    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(content) as LLMResponse;
      const isStructuredIntent = ('intent' in parsed) && ('workflow' in parsed || 'params' in parsed);
      if (!isStructuredIntent && !parsed.reply && !parsed.tool_calls) {
        const possibleReplyKeys = ['response', 'message', 'text', 'content'];
        const tempObj = parsed as unknown as Record<string, unknown>;
        for (const key of possibleReplyKeys) {
          if (typeof tempObj[key] === 'string' && tempObj[key]) {
            parsed.reply = tempObj[key] as string;
            break;
          }
        }
        if (!parsed.reply && (!parsed.workflow || !parsed.workflow.steps || parsed.workflow.steps.length === 0)) {
          parsed.reply = content;
        }
      }
    } catch {
      return {
        intent: 'UNKNOWN',
        confidence: 0.8,
        params: {},
        reply: content,
      };
    }

    if (!parsed.intent || !INTENT_LIST.includes(parsed.intent)) {
      parsed.intent = 'UNKNOWN';
      parsed.confidence = 0;
    }

    return parsed;
  }

  async embed(text: string): Promise<number[]> {
    if (this.config.provider === 'anthropic') {
      throw new Error('Embedding is not supported by provider: anthropic');
    }

    // Check cache
    const cached = this.embeddingCache.get(text);
    if (cached) {
      return cached;
    }

    const apiKey = this.config.apiKey;
    const baseUrl = this.config.baseUrl;

    if (!baseUrl) {
      throw new Error('Base URL is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as { data: { embedding: number[] }[] };
      const embedding = data.data[0].embedding;

      // Cache the result
      this.embeddingCache.set(text, embedding);

      return embedding;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async completeRaw(promptId: string, userInput: string, context?: Record<string, string>): Promise<string> {
    const systemPrompt = this.promptManager.buildSystemPrompt(promptId, context, this.sessionId);

    let response: Response;
    if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
      response = await this.callOpenAICompatibleRaw(userInput, systemPrompt);
    } else if (this.config.provider === 'anthropic') {
      response = await this.callAnthropicRaw(userInput, systemPrompt);
    } else {
      throw new Error(`Unsupported provider: ${this.config.provider}`);
    }

    const data = await response.json();

    if (this.config.provider === 'anthropic') {
      const anthropicData = data as { content?: { text?: string }[] };
      return anthropicData.content?.[0]?.text || '';
    }

    const openAIData = data as { choices?: { message?: { content?: string } }[] };
    return openAIData.choices?.[0]?.message?.content || '';
  }

  private async callOpenAICompatibleRaw(userInput: string, systemPrompt: string): Promise<Response> {
    const apiKey = this.config.apiKey;
    const baseUrl = this.config.baseUrl;

    if (!baseUrl) {
      throw new Error('Base URL is not configured');
    }

    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = this.config.timeout || 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const systemContent = systemPrompt.includes('json')
          ? systemPrompt
          : systemPrompt + '\n\nPlease respond in JSON format.';
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: 'system', content: systemContent },
              { role: 'user', content: userInput },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          keepalive: true,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        const errorText = await response.text();
        const status = response.status;
        const isRetryable = (status === 429 || status >= 500) && attempt < MAX_RETRIES;

        if (!isRetryable) {
          throw new Error(`OpenAI API error: ${status} - ${errorText}`);
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }

        const isApiError = error instanceof Error && error.message.startsWith('OpenAI API error:');
        if (isApiError) {
          throw error;
        }

        if (attempt === MAX_RETRIES) {
          throw error instanceof Error ? error : new Error(String(error));
        }
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw new Error('Max retries exceeded');
  }

  private async callAnthropicRaw(userInput: string, systemPrompt: string): Promise<Response> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new Error('API key is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userInput },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async generateYAMLWorkflow(userInput: string): Promise<string> {
    const systemPrompt = this.promptManager.buildSystemPrompt(DEFAULT_WORKFLOW_YAML_ID);
    const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 });
    
    const result = await skill.generateYAML(userInput, systemPrompt);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate YAML workflow');
    }
    
    return result.output;
  }

  /**
   * 实现 ILLMClient 接口的 chat 方法
   */
  async chat(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>
  ): Promise<LLMResponse> {
    try {
      let response: Response;

      if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
        response = await this.callOpenAICompatibleChat(messages);
      } else if (this.config.provider === 'anthropic') {
        response = await this.callAnthropicChat(messages);
      } else {
        throw new Error(`Unsupported provider: ${this.config.provider}`);
      }

      const data = await response.json();
      this.auditHelper.securityAction('LLM_CHAT', `${this.config.provider}/${this.config.model}`, 'COMPLETED', this.sessionId || 'unknown');

      return this.parseResponse(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.auditHelper.securityAction('LLM_CHAT', `${this.config.provider}/${this.config.model}`, 'FAILED', this.sessionId || 'unknown');

      throw new Error(`LLM chat failed: ${errorMessage}`, { cause: error });
    }
  }

  private async callOpenAICompatibleChat(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>
  ): Promise<Response> {
    const apiKey = this.config.apiKey;
    const baseUrl = this.config.baseUrl;

    if (!baseUrl) {
      throw new Error('Base URL is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestBody = {
        model: this.config.model,
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' } as Record<string, unknown>,
      };

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callAnthropicChat(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>
  ): Promise<Response> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new Error('API key is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const requestBody = {
        model: this.config.model,
        max_tokens: 1024,
        system: systemMessage?.content || '',
        messages: userMessages,
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export interface NLParserWithLLM {
  parse(input: string, sessionId?: string): Promise<LLMResponse>;
}

export function createLLMEnhancedParser(config: LLMConfig, deps: LLMClientDeps): NLParserWithLLM {
  const client = new LLMClient(config, deps);
  const promptContext = {
    intentList: INTENT_LIST.map(i => `- ${i}`).join('\n'),
    intentKeywords: buildKeywordSummary(),
  };

  return {
    async parse(input: string, sessionId?: string): Promise<LLMResponse> {
      client.setSessionId(sessionId || 'unknown');
      return client.complete(DEFAULT_INTENT_PARSER_ID, input, promptContext);
    },
  };
}

export function createLLMConfig(): LLMConfig | null {
  const resolution = resolveLLMConfig();
  if (resolution.state === 'invalid') {
    throw resolution.error;
  }
  return resolution.config;
}

function getDefaultModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'groq':
      return 'llama3-8b-8192';
    case 'ollama':
      return 'llama3';
    default:
      return 'gpt-4o-mini';
  }
}

export function isLLMAvailable(): boolean {
  return createLLMConfig() !== null;
}
