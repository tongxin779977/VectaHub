import type { LLMConfig, LLMTool, LLMResponse, LLMToolCall } from './interfaces.js';
import { getAllIntentNames } from './templates/index.js';

const INTENT_LIST = getAllIntentNames();

/**
 * LLM HTTP 客户端封装，负责处理与 LLM 提供商的 HTTP 通信
 */
export class LLMHttpClient {
  private config: LLMConfig;

  /**
   * 创建 LLM HTTP 客户端实例
   * @param config - LLM 配置对象
   */
  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * 调用 OpenAI 兼容的 API（OpenAI、Groq、Ollama）
   * @param userInput - 用户输入
   * @param systemPrompt - 系统提示词
   * @param tools - 可选的工具列表
   * @param toolChoice - 工具选择策略
   * @returns API 响应
   */
  async callOpenAICompatible(
    userInput: string,
    systemPrompt: string,
    tools?: LLMTool[],
    toolChoice?: string,
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
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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

  /**
   * 调用 Anthropic API
   * @param userInput - 用户输入
   * @param systemPrompt - 系统提示词
   * @param tools - 可选的工具列表
   * @returns API 响应
   */
  async callAnthropic(
    userInput: string,
    systemPrompt: string,
    tools?: LLMTool[],
  ): Promise<Response> {
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
        requestBody.tools = tools.map((tool) => ({
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

  async callOpenAICompatibleRaw(
    userInput: string,
    systemPrompt: string,
  ): Promise<Response> {
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
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    throw new Error('Max retries exceeded');
  }

  async callAnthropicRaw(
    userInput: string,
    systemPrompt: string,
  ): Promise<Response> {
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

  async callOpenAICompatibleChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
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
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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

  async callAnthropicChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): Promise<Response> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new Error('API key is not configured');
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const systemMessage = messages.find((m) => m.role === 'system');
      const userMessages = messages.filter((m) => m.role !== 'system');

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

  parseResponse(data: unknown, sessionId?: string, assistantMessageCallback?: (content: string) => void): LLMResponse {
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

    if (toolCalls && toolCalls.length > 0) {
      return {
        intent: 'UNKNOWN',
        confidence: 0,
        params: {},
        workflow: { name: '', steps: [] },
        tool_calls: toolCalls,
      };
    }

    if (sessionId && content && assistantMessageCallback) {
      assistantMessageCallback(content);
    }

    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(content) as LLMResponse;
      const isStructuredIntent = 'intent' in parsed && ('workflow' in parsed || 'params' in parsed);
      if (!isStructuredIntent && !parsed.reply && !parsed.tool_calls) {
        const possibleReplyKeys = ['response', 'message', 'text', 'content', 'name', 'answer', 'description'];
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
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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

      const data = (await response.json()) as { data: { embedding: number[] }[] };
      return data.data[0].embedding;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
