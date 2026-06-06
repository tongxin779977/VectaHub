import type { AuditHelper } from '../infrastructure/audit/index.js';
import { buildKeywordSummary } from './templates/index.js';
import { createPromptManager, DEFAULT_INTENT_PARSER_ID } from './prompt-manager.js';
import type { LLMConfig, LLMTool, LLMResponse, LLMToolCall, LLMWorkflowStepInline } from './interfaces.js';
import { LLMHttpClient } from './llm-http-client.js';
import {
  resolveLLMConfig,
  createLLMConfigDigestSource,
  createLLMConfig,
  isLLMAvailable,
  getDefaultModel,
} from './llm-config.js';
import { getAllIntentNames } from './templates/index.js';
import { createLLMDialogControlSkill } from '../skills/llm-dialog-control/index.js';
import { DEFAULT_WORKFLOW_YAML_ID } from './prompt-manager.js';

export type { LLMConfig, LLMTool, LLMResponse, LLMToolCall, LLMWorkflowStepInline };
export {
  resolveLLMConfig,
  createLLMConfigDigestSource,
  createLLMConfig,
  isLLMAvailable,
  getDefaultModel,
};

/**
 * LLM 客户端依赖注入接口
 */
export interface LLMClientDeps {
  auditHelper: AuditHelper;
}

export interface LLMRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<LLMRetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

const INTENT_LIST = getAllIntentNames();

/**
 * LLM 客户端 - 负责与 LLM 交互的主要类
 *
 * 功能职责：
 * - 管理 LLM 配置和会话生命周期
 * - 通过 LLMHttpClient 执行实际 HTTP 调用
 * - 提供统一的重试机制（指数退避）
 * - 管理 Embedding 缓存
 * - 记录审计日志
 *
 * 重试策略：对可重试错误（429/5xx/网络超时）自动重试，指数退避。
 */
export class LLMClient {
  private config: LLMConfig;
  private sessionId?: string;
  private promptManager;
  private embeddingCache: Map<string, number[]> = new Map();
  private auditHelper: AuditHelper;
  private httpClient: LLMHttpClient;
  private retryOptions: Required<LLMRetryOptions>;

  /**
   * 创建 LLM 客户端实例
   * @param config - LLM 配置对象
   * @param deps - 依赖注入对象
   * @param retryOptions - 可选的重试配置
   * @throws 配置无效时抛出错误
   */
  constructor(config: LLMConfig, deps: LLMClientDeps, retryOptions?: LLMRetryOptions) {
    this.config = config;
    this.promptManager = createPromptManager();
    this.auditHelper = deps.auditHelper;
    this.httpClient = new LLMHttpClient(config);
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  }

  /**
   * 设置会话 ID
   * @param sessionId - 会话标识符
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.promptManager.sessionManager.getOrCreateSession(sessionId);
  }

  /**
   * 获取会话管理器
   */
  get sessionManager() {
    return this.promptManager.sessionManager;
  }

  /**
   * 带指数退避重试的异步执行器
   *
   * @param fn - 要执行的异步函数
   * @param operationName - 操作名称（用于日志）
   * @returns 执行结果
   * @throws 重试耗尽后抛出最后一次错误
   */
  private async withRetry<T>(fn: () => Promise<T>, _operationName: string): Promise<T> {
    const { maxRetries, baseDelayMs, maxDelayMs } = this.retryOptions;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          throw error;
        }
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
    }

    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        const msg = (error as Error).message?.toLowerCase() ?? '';
        if (msg.includes('user') || msg.includes('cancel')) return false;
        return true;
      }
      const msg = error.message;
      if (msg.includes('API error:')) {
        const statusMatch = msg.match(/API error: (\d+)/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1], 10);
          return this.retryOptions.retryableStatuses.includes(status);
        }
      }
      if (msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) {
        return true;
      }
    }
    return false;
  }

  /**
   * 完成 LLM 调用（带自动重试）
   *
   * @param promptId - 提示词模板 ID
   * @param userInput - 用户输入
   * @param context - 上下文变量
   * @param options - 可选工具和策略
   * @returns LLM 响应对象
   * @throws LLM 调用失败且不可重试时抛出错误
   */
  async complete(
    promptId: string,
    userInput: string,
    context?: Record<string, string>,
    options?: { tools?: LLMTool[]; toolChoice?: string },
  ): Promise<LLMResponse> {
    try {
      return await this.withRetry(async () => {
        const systemPrompt = this.promptManager.buildSystemPrompt(promptId, context, this.sessionId);
        if (this.sessionId) {
          this.promptManager.sessionManager.addUserMessage(this.sessionId, userInput);
        }
        let response: Response;

        if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
          response = await this.httpClient.callOpenAICompatible(
            userInput,
            systemPrompt,
            options?.tools,
            options?.toolChoice,
          );
        } else if (this.config.provider === 'anthropic') {
          response = await this.httpClient.callAnthropic(userInput, systemPrompt, options?.tools);
        } else {
          throw new Error(`Unsupported provider: ${this.config.provider}`);
        }

        const data = await response.json();
        this.auditHelper.securityAction(
          'LLM_CALL',
          `${this.config.provider}/${this.config.model}`,
          'COMPLETED',
          this.sessionId || 'unknown',
        );

        return this.httpClient.parseResponse(data, this.sessionId, (content) => {
          if (this.sessionId) {
            this.promptManager.sessionManager.addAssistantMessage(this.sessionId, content);
          }
        });
      }, 'LLM_CALL');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.auditHelper.securityAction(
        'LLM_CALL',
        `${this.config.provider}/${this.config.model}`,
        'FAILED',
        this.sessionId || 'unknown',
      );

      throw new Error(`LLM call failed: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * 获取文本的嵌入向量
   * @param text - 输入文本
   * @returns 嵌入向量数组
   */
  async embed(text: string): Promise<number[]> {
    const cached = this.embeddingCache.get(text);
    if (cached) {
      return cached;
    }

    const embedding = await this.httpClient.embed(text);
    this.embeddingCache.set(text, embedding);
    return embedding;
  }

  /**
   * 完成原始 LLM 调用（无工具调用，返回纯文本）
   * @param promptId - 提示词模板 ID
   * @param userInput - 用户输入
   * @param context - 上下文变量
   * @returns 纯文本响应
   */
  async completeRaw(promptId: string, userInput: string, context?: Record<string, string>): Promise<string> {
    const systemPrompt = this.promptManager.buildSystemPrompt(promptId, context, this.sessionId);

    let response: Response;
    if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
      response = await this.httpClient.callOpenAICompatibleRaw(userInput, systemPrompt);
    } else if (this.config.provider === 'anthropic') {
      response = await this.httpClient.callAnthropicRaw(userInput, systemPrompt);
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

  /**
   * 生成 YAML 工作流
   * @param userInput - 用户输入
   * @returns YAML 工作流字符串
   */
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
   * 完成多轮对话调用（带自动重试）
   * @param messages - 消息数组
   * @returns LLM 响应对象
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): Promise<LLMResponse> {
    try {
      return await this.withRetry(async () => {
        let response: Response;

        if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
          response = await this.httpClient.callOpenAICompatibleChat(messages);
        } else if (this.config.provider === 'anthropic') {
          response = await this.httpClient.callAnthropicChat(messages);
        } else {
          throw new Error(`Unsupported provider: ${this.config.provider}`);
        }

        const data = await response.json();
        this.auditHelper.securityAction(
          'LLM_CHAT',
          `${this.config.provider}/${this.config.model}`,
          'COMPLETED',
          this.sessionId || 'unknown',
        );

        return this.httpClient.parseResponse(data);
      }, 'LLM_CHAT');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.auditHelper.securityAction(
        'LLM_CHAT',
        `${this.config.provider}/${this.config.model}`,
        'FAILED',
        this.sessionId || 'unknown',
      );

      throw new Error(`LLM chat failed: ${errorMessage}`, { cause: error });
    }
  }
}

/**
 * 带有 LLM 的自然语言解析器接口
 */
export interface NLParserWithLLM {
  parse(input: string, sessionId?: string): Promise<LLMResponse>;
}

/**
 * 创建增强的 LLM 自然语言解析器
 * @param config - LLM 配置对象
 * @param deps - 依赖注入对象
 * @returns 解析器实例
 */
export function createLLMEnhancedParser(config: LLMConfig, deps: LLMClientDeps): NLParserWithLLM {
  const client = new LLMClient(config, deps);
  const promptContext = {
    intentList: INTENT_LIST.map((i) => `- ${i}`).join('\n'),
    intentKeywords: buildKeywordSummary(),
  };

  return {
    async parse(input: string, sessionId?: string): Promise<LLMResponse> {
      client.setSessionId(sessionId || 'unknown');
      return client.complete(DEFAULT_INTENT_PARSER_ID, input, promptContext);
    },
  };
}
