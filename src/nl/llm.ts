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
import createLLMDialogControlSkill from '../skills/llm-dialog-control/index.js';
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

const INTENT_LIST = getAllIntentNames();

/**
 * LLM 客户端 - 负责与 LLM 交互的主要类
 */
export class LLMClient {
  private config: LLMConfig;
  private sessionId?: string;
  private promptManager;
  private embeddingCache: Map<string, number[]> = new Map();
  private auditHelper: AuditHelper;
  private httpClient: LLMHttpClient;

  /**
   * 创建 LLM 客户端实例
   * @param config - LLM 配置对象
   * @param deps - 依赖注入对象
   */
  constructor(config: LLMConfig, deps: LLMClientDeps) {
    this.config = config;
    this.promptManager = createPromptManager();
    this.auditHelper = deps.auditHelper;
    this.httpClient = new LLMHttpClient(config);
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
   * 完成 LLM 调用
   * @param promptId - 提示词模板 ID
   * @param userInput - 用户输入
   * @param context - 上下文变量
   * @param options - 可选工具和策略
   * @returns LLM 响应对象
   */
  async complete(
    promptId: string,
    userInput: string,
    context?: Record<string, string>,
    options?: { tools?: LLMTool[]; toolChoice?: string },
  ): Promise<LLMResponse> {
    try {
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
   * 完成多轮对话调用
   * @param messages - 消息数组
   * @returns LLM 响应对象
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): Promise<LLMResponse> {
    try {
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
