import type { LLMConfig, LLMTool, LLMResponse, LLMToolCall } from './interfaces.js';
import { getAllIntentNames } from './templates/index.js';

const INTENT_LIST = getAllIntentNames();

const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_QUEUE_SIZE = 16;
const DEFAULT_QUEUE_TIMEOUT_MS = 30_000;

interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
}

/**
 * 请求队列管理器，限制并发 LLM HTTP 请求数量
 *
 * 使用信号量模式控制同时进行的请求数，超出上限的请求进入等待队列。
 * 队列满或等待超时时快速失败，避免无限阻塞。
 */
export class RequestQueue {
  private running: number = 0;
  private readonly queue: Array<QueuedRequest<unknown>> = [];
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeoutMs: number;

  /**
   * 创建请求队列实例
   * @param options.maxConcurrent - 最大并发请求数，默认 4
   * @param options.maxQueueSize - 等待队列最大长度，默认 16
   * @param options.queueTimeoutMs - 队列等待超时时间（毫秒），默认 30000
   */
  constructor(options?: {
    maxConcurrent?: number;
    maxQueueSize?: number;
    queueTimeoutMs?: number;
  }) {
    this.maxConcurrent = options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.maxQueueSize = options?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.queueTimeoutMs = options?.queueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS;
  }

  /**
   * 将异步任务排入队列，受并发限制控制
   * @param execute - 要执行的异步函数
   * @returns 任务执行结果
   * @throws 队列满或等待超时时抛出错误
   */
  async enqueue<T>(execute: () => Promise<T>): Promise<T> {
    if (this.running < this.maxConcurrent) {
      return this.runTask(execute);
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(
        `Request queue full (${this.maxQueueSize}). ${this.running} requests in flight, max concurrent: ${this.maxConcurrent}.`,
      );
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueuedRequest<T> = {
        execute,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      this.queue.push(item as QueuedRequest<unknown>);
    });
  }

  /** 当前正在执行的请求数 */
  get activeCount(): number {
    return this.running;
  }

  /** 当前排队等待的请求数 */
  get pendingCount(): number {
    return this.queue.length;
  }

  private async runTask<T>(execute: () => Promise<T>): Promise<T> {
    this.running++;
    try {
      return await execute();
    } finally {
      this.running--;
      this.flushNext();
    }
  }

  private flushNext(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift()!;
      const waitMs = Date.now() - next.enqueuedAt;
      if (waitMs > this.queueTimeoutMs) {
        next.reject(
          new Error(`Request queue timeout: waited ${waitMs}ms, limit ${this.queueTimeoutMs}ms`),
        );
        continue;
      }
      this.runTask(next.execute).then(next.resolve, next.reject);
    }
  }
}

/**
 * LLM HTTP 客户端封装，负责处理与 LLM 提供商的 HTTP 通信
 *
 * 内置请求队列机制，默认最大并发 4 个请求，超出时排队等待。
 * 每个 HTTP 调用方法（callOpenAICompatible、callAnthropic 等）均通过队列调度。
 */
export class LLMHttpClient {
  private config: LLMConfig;
  private requestQueue: RequestQueue;

  /**
   * 创建 LLM HTTP 客户端实例
   * @param config - LLM 配置对象
   * @param requestQueue - 可选的自定义请求队列实例
   */
  constructor(config: LLMConfig, requestQueue?: RequestQueue) {
    this.config = config;
    this.requestQueue = requestQueue ?? new RequestQueue();
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
    return this.requestQueue.enqueue(() =>
      this.callOpenAICompatibleInner(userInput, systemPrompt, tools, toolChoice),
    );
  }

  private async callOpenAICompatibleInner(
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

    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

        if (error instanceof Error && error.message.startsWith('OpenAI API error:')) {
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
    return this.requestQueue.enqueue(() =>
      this.callAnthropicInner(userInput, systemPrompt, tools),
    );
  }

  private async callAnthropicInner(
    userInput: string,
    systemPrompt: string,
    tools?: LLMTool[],
  ): Promise<Response> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      throw new Error('API key is not configured');
    }

    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        const errorText = await response.text();
        const status = response.status;
        const isRetryable = (status === 429 || status >= 500) && attempt < MAX_RETRIES;

        if (!isRetryable) {
          throw new Error(`Anthropic API error: ${status} - ${errorText}`);
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.message.startsWith('Anthropic API error:')) {
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

  async callOpenAICompatibleRaw(
    userInput: string,
    systemPrompt: string,
  ): Promise<Response> {
    return this.requestQueue.enqueue(() =>
      this.callOpenAICompatibleRawInner(userInput, systemPrompt),
    );
  }

  private async callOpenAICompatibleRawInner(
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
    return this.requestQueue.enqueue(() =>
      this.callAnthropicRawInner(userInput, systemPrompt),
    );
  }

  private async callAnthropicRawInner(
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
    return this.requestQueue.enqueue(() =>
      this.callOpenAICompatibleChatInner(messages),
    );
  }

  private async callOpenAICompatibleChatInner(
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
    return this.requestQueue.enqueue(() =>
      this.callAnthropicChatInner(messages),
    );
  }

  private async callAnthropicChatInner(
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
        if (!parsed.reply) {
          const values = Object.values(tempObj);
          const stringValues = values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          if (stringValues.length === 1 && values.length <= 2) {
            parsed.reply = stringValues[0];
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
    return this.requestQueue.enqueue(() => this.embedInner(text));
  }

  private async embedInner(text: string): Promise<number[]> {
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
