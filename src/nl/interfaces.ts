/**
 * NL (Natural Language) 模块接口定义
 * 遵循 Interface-first 原则，不包含实现代码
 */

import type {
  IntentMatch, MultiIntentResult } from './types.js';
import type { IntentName } from '../types/index.js';

/**
 * LLM 配置接口
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'groq';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  timeout?: number;
}

/**
 * LLM 工具定义
 */
export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * LLM 工具调用
 */
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * LLM 工作流步骤（支持递归嵌套 body）
 */
export interface LLMWorkflowStepInline {
  type: 'exec' | 'for_each' | 'if' | 'parallel';
  cli?: string;
  args?: string[];
  condition?: string;
  items?: string;
  body?: LLMWorkflowStepInline[];
}

/**
 * LLM 响应接口（权威定义）
 *
 * 响应形态：
 * - tool calling 响应：包含 `tool_calls`
 * - workflow 响应：包含 `workflow`
 * - dialog 响应：包含 `reply`
 * - unknown/low-confidence 响应：允许无 workflow，调用方必须显式处理
 */
export interface LLMResponse {
  intent: string;
  confidence: number;
  params: Record<string, unknown>;
  reply?: string;
  workflow?: {
    name: string;
    steps: LLMWorkflowStepInline[];
  };
  tool_calls?: LLMToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * NL 上下文接口
 */
export interface NLContext {
  input: string;
  sessionId?: string;
  projectPath?: string;
  previousOutputs?: Record<string, unknown>;
  previousIntents?: string[];
}

/**
 * NL 处理结果接口
 */
export interface NLResult {
  success: boolean;
  intent?: IntentName;
  confidence: number;
  workflowYAML?: string;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  taskList?: Array<{
    id: string;
    type: string;
    description: string;
  }>;
  error?: string;
}

/**
 * NL 处理器接口
 */
export interface INLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}

/**
 * 意图匹配器接口
 */
export interface IIntentMatcher {
  match(input: string, sessionId?: string): IntentMatch;
  matchMultiIntent(input: string, sessionId?: string): MultiIntentResult;
  registerPattern(pattern: unknown): void;
  getPatterns(): unknown[];
}

/**
 * LLM 客户端接口
 */
export interface ILLMClient {
  complete(
    promptId: string,
    input: string,
    variables?: Record<string, unknown>,
    options?: {
      tools?: LLMTool[];
      toolChoice?: 'auto' | 'none' | 'required';
    }
  ): Promise<LLMResponse>;
  chat(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>
  ): Promise<LLMResponse>;
}
